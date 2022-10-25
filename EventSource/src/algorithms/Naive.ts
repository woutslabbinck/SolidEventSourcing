/***************************************
 * Title: Naive store and rebalance algorithm
 * Description: Stores raw RDF data points to an version aware LDES in LDP
 * * Adds a version identifier to the raw RDF data points (resources)
 * * Adds all the resources to the correct container (based on the tree:Node its relations)
 * * Rebalances the containers to not contain more than X (which is configurable) resources per container
 * Author: Wout Slabbinck (wout.slabbinck@ugent.be)
 * Created on 09/06/2022
 *****************************************/

import {addResourcesToBuckets, calculateBucket, getTimeStamp, Resource} from "../util/EventSource";
import {
    extractLdesMetadata,
    LDESinLDP,
    LDESinLDPConfig,
    LDPCommunication,
    SolidCommunication,
    storeToString
} from "@treecg/versionawareldesinldp";
import {Session} from "@rubensworks/solid-client-authn-isomorphic"
import {addRelationToNode, createContainer} from "@treecg/versionawareldesinldp/dist/ldesinldp/Util";
import {DataFactory, Store} from "n3";
import {rebalanceContainer} from "./NaiveRebalancing";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";
import {performance, PerformanceObserver} from 'perf_hooks'
import {editMetadata} from "../util/Util";
const {quad, namedNode} = DataFactory


/** Algorithm A
 *
 *  * step 1: check whether ldes is initialised
 *    * init ldes when not
 *  * step 2: add all resources to correct bucket
 *  * step 3: rebalance
 *
 *  * Params:
 *    * LDESinLDPURL (string)
 *    * 1000 resources (Resource[])
 *    * version ID
 */
export async function naiveAlgorithm(lilURL: string, resources: Resource[], versionID: string, bucketSize: number, config: LDESinLDPConfig, prefixes: any, session?: Session, loglevel: string = 'info'): Promise<void> {

    const logger = new Logger(naiveAlgorithm.name, loglevel)

    // https://dev.to/typescripttv/measure-execution-times-in-browsers-node-js-js-ts-1kik
    // extra filter step to be unique
    const observer = new PerformanceObserver(list =>
        list.getEntries().filter(entry =>
            entry.detail === naiveAlgorithm.name
        ).forEach(entry =>
            logger.info(
                entry.name + " took " + Math.round(entry.duration) + " ms to complete"
            )
        )
    );
    observer.observe({buffered: false, entryTypes: ['measure']});

    const markStart = "start"
    const step1 = "step1"
    const step2 = "step2"
    const step3 = "step3"
    performance.mark(markStart);

    // step 1: init ldes if not initialised yet
    const comm = session ? new SolidCommunication(session) : new LDPCommunication();
    const lil = new LDESinLDP(lilURL, comm);
    await lil.initialise(config);

    performance.mark(step1);
    // step 2: add all resources to correct bucket
    // calculate correct bucket for each resources
    const metadataStore = await lil.readMetadata()

    const metadata = extractLdesMetadata(metadataStore, lilURL + "#EventStream")


    // create key value store for the buckets (and each resource will be placed in one of them)
    const bucketResources: {[key: string]: Resource[]} = {}
    for (const relation of metadata.views[0].relations) {
        bucketResources[relation.node] = []
    }
    bucketResources["none"] = []

    let earliestResourceTs = Infinity
    for (const resource of resources) {
        // calculate bucket
        const bucket = calculateBucket(resource, metadata);
        bucketResources[bucket].push(resource)

        // calculate earliest resource
        const resourceTs = getTimeStamp(resource, metadata.timestampPath)
        if (earliestResourceTs > resourceTs) {
            earliestResourceTs = resourceTs
        }

        // add version identifier to resource
        const resourceStore = new Store(resource)
        const subject = resourceStore.getSubjects(metadata.timestampPath, null, null)[0] // Note: kind of hardcoded to get subject of resource
        resourceStore.add(quad(subject, namedNode(metadata.versionOfPath), namedNode(versionID)))
    }
    // earliest time
    logger.debug("Time of oldest resource: " + new Date(earliestResourceTs).toISOString() + " |  in ms: " + earliestResourceTs)

    // create the earliest bucket (based on earliest resource)
    if (bucketResources["none"].length !== 0) {
        // number of resources that don't belong into any bucket
        logger.debug("Number of resources not belonging to any bucket: " + bucketResources["none"].length)
        const newContainerURL = lilURL + earliestResourceTs + "/"
        logger.debug("Creating new container at " + newContainerURL + " for those resources.")

        await createContainer(newContainerURL, comm)
        const store = new Store()
        addRelationToNode(store, {
            date: new Date(earliestResourceTs),
            nodeIdentifier: lilURL,
            treePath: config.treePath
        })
        const insertBody = `INSERT DATA { ${storeToString(store)}}`
        await editMetadata(lilURL, comm, insertBody)

        // replace bucket "none" to the actual url
        bucketResources[newContainerURL] = bucketResources["none"]
    }
    delete bucketResources["none"]
    // add resource to each bucket
    await addResourcesToBuckets(bucketResources, metadata, comm, prefixes);

    performance.mark(step2);

    // step 3: rebalance the buckets
    // go over each bucket over the LDES that has more than 100 resources
    // and create new buckets such that at the end there are less than 100 per bucket.
    for (const bucketURL of Object.keys(bucketResources)) {
        await rebalanceContainer(comm, metadata, bucketURL, bucketSize, prefixes)
    }
    performance.mark(step3);

    // time measurements
    performance.measure("step 1: init ldes", {start: markStart, end: step1, detail: naiveAlgorithm.name});
    performance.measure("step 2: add all resources to the containers", {
        start: step1,
        end: step2,
        detail: naiveAlgorithm.name
    });
    performance.measure("step 3: rebalance the LDES in LDP", {start: step2, end: step3, detail: naiveAlgorithm.name});
    performance.measure(`${naiveAlgorithm.name} total execution`, {
        start: markStart,
        end: step3,
        detail: naiveAlgorithm.name
    });

}
