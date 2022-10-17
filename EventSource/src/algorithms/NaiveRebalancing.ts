/***************************************
 * Title: NaiveRebalancing
 * Description: Rebalances the LDES in LDP
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 09/06/2022
 *****************************************/

import {
    Communication,
    extractLdesMetadata,
    LDESMetadata,
    LDP, storeToString,
    turtleStringToStore
} from "@treecg/versionawareldesinldp";
import {addResourcesToBuckets, calculateBucket, createBucketUrl, getTimeStamp, Resource} from "../EventSourceUtil";
import {convertLdesMetadata, editMetadata} from "../Util";
import {Store} from "n3";
import {addRelationToNode, createContainer} from "@treecg/versionawareldesinldp/dist/ldesinldp/Util";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";
import {performance, PerformanceObserver} from "perf_hooks";

/**
 * In order to correctly rebalance the container,
 * this algorithm assumes that all resources in the container are in fact part of the LDES in LDP
 * @param ldpCommunication
 * @param metadata
 * @param containerURL
 * @param bucketSize
 * @param loglevel
 * @returns {Promise<void>}
 */
export async function rebalanceContainer(ldpCommunication: Communication, metadata: LDESMetadata, containerURL: string,
                                         bucketSize: number, prefixes: any, loglevel: string = 'info'): Promise<void> {

    const logger = new Logger(rebalanceContainer.name, loglevel)
    // https://dev.to/typescripttv/measure-execution-times-in-browsers-node-js-js-ts-1kik
    // extra filter step to be unique
    const observer = new PerformanceObserver(list => list.getEntries().filter(entry => entry.detail === containerURL)
        .forEach(entry => logger.info(entry.name + " took " + Math.round(entry.duration) + " ms to complete")));
    observer.observe({buffered: false, entryTypes: ['measure']});

    const markStart = rebalanceContainer.name + "start"
    const preparation = rebalanceContainer.name + "prep"
    const step1 = rebalanceContainer.name + "step1"
    const step2 = rebalanceContainer.name + "step2"
    const step3 = rebalanceContainer.name + "step3"
    const step4 = rebalanceContainer.name + "step4"
    performance.mark(markStart);

    const containerResponse = await ldpCommunication.get(containerURL)
    const containerStore = await turtleStringToStore(await containerResponse.text(), containerURL)
    const amountResources = containerStore.countQuads(containerURL, LDP.contains, null, null)

    if (amountResources <= bucketSize) {
        logger.info(`There are ${amountResources} resources in the container, which is less than or equal to the amount allowed per container (${bucketSize}).`)
        return
    }
    logger.info(`There are ${amountResources} resources in the container, which is greater than the amount allowed per container (${bucketSize}).`)
    logger.info("Balancing is starting now.")

    // Preparation: fetch all resources in the container and sort them by date (smallest date first)
    const resources: Resource[] = []
    const resourcesLocationMap: Map<Resource, string> = new Map()
    for (const resourceSubject of containerStore.getObjects(containerURL, LDP.contains, null)) {
        const resourceURL = resourceSubject.value
        const response = await ldpCommunication.get(resourceURL) // also possible to fail
        const resourceStore = await turtleStringToStore(await response.text(), resourceURL)
        const resource = resourceStore.getQuads(null, null, null, null)
        resources.push(resource)

        resourcesLocationMap.set(resource, resourceURL)
    }
    resources.sort((a, b) => {
        const timeA = getTimeStamp(a, metadata.timestampPath)
        const timeB = getTimeStamp(b, metadata.timestampPath)
        // if a > b <=> a -b > 0 <=> a is bigger than b <=> sort a after b
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort#description
        return timeA - timeB
    })
    performance.mark(preparation);

    // 3a: calculate buckets
    // convert metadata to store again
    const metadataStore = convertLdesMetadata(metadata)
    const updateToRoot = new Store() // This store is used to patch the root of the LDES in LDP

    // Calculate bucketResources
    const bucketResources: { [key: string]: Resource[] } = {}
    const amountNewBuckets = Math.floor((amountResources - 1) / bucketSize) // minus one for correct amount
    const indexes = Array.from(Array(amountNewBuckets).keys()).map(value => (value + 1) * bucketSize) // https://stackoverflow.com/a/36953272
    for (const index of indexes) {
        const timestamp = getTimeStamp(resources[index], metadata.timestampPath)
        const newURL = createBucketUrl(containerURL, timestamp)
        bucketResources[newURL] = []
        logger.debug(newURL + ' | for timestamp: ' + new Date(timestamp).toISOString())

        const relationConfig = {
            date: new Date(timestamp),
            nodeIdentifier: metadata.views[0].id, // Note: we assume one rootnode
            treePath: metadata.timestampPath
        }
        // add bucket to metadataStore
        addRelationToNode(metadataStore, relationConfig)

        // add relation to store that is responsible for updating the root node
        addRelationToNode(updateToRoot, relationConfig)
    }

    // convert as the new metadata of the ldes
    const updatedMetadata = extractLdesMetadata(metadataStore, metadata.ldesEventStreamIdentifier)

    // calculate buckets per resources
    for (const resource of resources) {
        const bucket = calculateBucket(resource, updatedMetadata);

        // make sure to not copy the resource again in its own container
        if (bucket in bucketResources) {
            bucketResources[bucket].push(resource)
        }
    }

    performance.mark(step1);

    // 3b: create buckets
    for (const containerURL of Object.keys(bucketResources)) {
        await createContainer(containerURL, ldpCommunication)
    }
    performance.mark(step2);

    // 3c: Copy the resources to the new buckets
    await addResourcesToBuckets(bucketResources, metadata, ldpCommunication, prefixes)
    performance.mark(step3);

    // 3d: Remove the old resources and add relations to the root
    // remove old resources
    for (const containerURL of Object.keys(bucketResources)) {
        for (const resource of bucketResources[containerURL]) {
            const resourceUrl = resourcesLocationMap.get(resource)
            if (resourceUrl) {
                const response = await ldpCommunication.delete(resourceUrl)
            } else {
                logger.error('for some reason, following resource could not be deleted: ' + resourceUrl)
            }
            // error handling must still be done
        }
    }

    // update root
    const insertBody = `INSERT DATA { ${storeToString(updateToRoot)}}`
    await editMetadata(metadata.views[0].id, ldpCommunication, insertBody) // again assumption that there is only 1 view

    performance.mark(step4);

    // TODO: functionality that deals with inbox (which might have to be swapped)

    // 3e: check if resources in starting bucket are within its bounds

    // time measurements
    performance.measure(`Preparation: fetch all resources in the container and sort them by date`, {
        start: markStart,
        end: preparation,
        detail: containerURL
    });
    performance.measure("step a: calculate buckets", {start: preparation, end: step1, detail: containerURL});
    performance.measure("step b: create containers for the buckets", {
        start: step1,
        end: step2,
        detail: containerURL
    });
    performance.measure("step c: copy resources in the new containers", {
        start: step2,
        end: step3,
        detail: containerURL
    });
    performance.measure("step d: cleanup (add relations to the root and remove moved resources)", {
        start: step3,
        end: step4,
        detail: containerURL
    });
    performance.measure(`${rebalanceContainer.name} total execution for ${containerURL} (${amountResources} resources)`, {
        start: markStart,
        end: step4,
        detail: containerURL
    });
}
