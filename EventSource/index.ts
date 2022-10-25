// High level algorithm to transform a large amount of resources (marked with a timestamp) to an event source (LDES in LDP)
/**
 *
 * Assumptions:
 *  * resources are not ordered
 *  * Sorting all of them (if really big) would make it easier, but might not always be feasible (as it might be too big in memory)
 *  * ?Oldest timestamp is known however
 *
 * Approach
 *  * First algorithm `A`: takes ~1000 resources as input (Note: This algorithm can be used naive for all resources)
 *    * Add all resources in the correct `bucket` in the LDES
 *    * rebalance each `bucket` such that each one of them contains no more than X resources
 *  * Second algorithm `B`: uses `A` to add resources in correct `bucket`
 *    * Do batch processing with 1000 resources using algorithm A, where the rebalancing must be finished before doing the next step
 *
 * Needed: Connector that can read raw long vs short resources
 * Some configuration about the bucket size (assumption, 100)
 */

import {
    extractLdesMetadata,
    LDES,
    LDESinLDP,
    LDESConfig,
    LDESMetadata,
    LDPCommunication,
    RDF,
    SolidCommunication
} from "@treecg/versionawareldesinldp"
import {
    getTimeStamp,
    initSession,
    prefixesFromFilepath,
    resourceToOptimisedTurtle
} from "./src/util/EventSource";
import {
    storeFromFile,
    extractResources,
    batchResources
} from "./src/util/Processing";
import { naiveAlgorithm } from "./src/algorithms/Naive";
import { Logger } from "@treecg/versionawareldesinldp/dist/logging/Logger";

const loglevel = "info"
const logger = new Logger("EventSource", loglevel)

async function run() {
    const fileName = process.argv[2]
    const lilURL = process.argv[3]
    const versionIdentifier = process.argv[4]
    const amount = parseInt(process.argv[5], 10)
    const credentialsFileName = process.argv[6]
    const treePath = process.argv[7]
    let bucketSize = parseInt(process.argv[8], 10);
    if (isNaN(bucketSize)) {
        // bucket size was not set, so defaulting back to 100
        logger.info(`No valid bucket size defined. Defaulting to a 100 UUIDs per bucket.`);
        bucketSize = 100;
    }
    // defined in bytes, so ~1000000 would result in 1MB of max
    // resource size
    let targetResourceSize = parseInt(process.argv[9], 10);
    if (isNaN(targetResourceSize) || targetResourceSize < 0) {
        // default behaviour is achieved by setting the target
        // size to 0 (smallest possible size per resource)
        logger.info(`No valid targetResourceSize defined. Defaulting to a single resource per UUID.`);
        targetResourceSize = 0;
    }
    const prefixFile = process.argv[10];
    const prefixes = await prefixesFromFilepath(prefixFile, lilURL);

    const versionOfPath = process.argv[11];

    logger.info(`Data file used: ${fileName}`)
    logger.info(`LDES in Solid URL: ${lilURL}`)
    logger.info(`Version Identifier: ${versionIdentifier}`)
    logger.info(`Timestamp path: ${treePath}`)
    logger.info(`VersionOf path: ${versionOfPath}`)
    const session = await initSession(credentialsFileName);
    if (session) {
        logger.info(`User logged in: ${session.info.webId}`)
    }
    // Retrieve metadata of lil if it already exists
    const comm = session ? new SolidCommunication(session) : new LDPCommunication();
    const lil = new LDESinLDP(lilURL, comm);
    let metadata: LDESMetadata | undefined

    try {
        const metadataStore = await lil.readMetadata()
        const ldes = metadataStore.getSubjects(RDF.type, LDES.EventStream, null)
        if (ldes.length > 1) {
            logger.info(`Multiple LDESes detected. ${ldes[0].value} was extracted`)
        }
        metadata = extractLdesMetadata(metadataStore, ldes[0].value)
    } catch (e) {
        // the LDES in LDP does not exist if this fail -> there is no metadata
    }
    // Retrieve data points and put them into resources
    const store = await storeFromFile(fileName);
    const eventStreamURI = metadata ? metadata.ldesEventStreamIdentifier : lilURL + '#EventStream';
    // extract every resource based on the subject, where
    // the subject has the predicate treePath
    const sourceResources = extractResources(store, treePath, eventStreamURI);
    // as these values have a timestamp defined using the treePath, sorting can
    // be applied on this data; this is important for correct grouping later
    sourceResources.sort((first, second) => {
        return getTimeStamp(first, treePath) - getTimeStamp(second, treePath);
    });
    if (sourceResources.length === 0) {
        logger.info(`No valid source data found. Exiting...`);
        return;
    }
    // grouping resources from sourceResources together based on size of a single resource and the target resource
    // size
    // assume every sourceResource entry is of the same length (on average) to calculate the number of resources
    // that are to be grouped together
    const resourceGroupCount = 1 + Math.floor(targetResourceSize / resourceToOptimisedTurtle(sourceResources[0], prefixes).length);
    const resources = batchResources(sourceResources, resourceGroupCount);

    let amountResources: number = amount
    // if input is not a number use the entire collection
    if (isNaN(amount)) {
        amountResources = resources.length
    }

    const config: LDESConfig = {
        LDESinLDPIdentifier: lilURL,
        treePath: treePath,
        versionOfPath: versionOfPath
    }

    logger.info(`Resources per UUID: ${resourceGroupCount}`)
    logger.info("Naive algorithm: Execution for " + amountResources + " resources with a bucket size of " + bucketSize);
    await naiveAlgorithm(lilURL, resources.slice(0, amountResources), versionIdentifier, bucketSize, config, prefixes, session, loglevel);
    // Note: currently removed as otherwise no time will be used. Now it might not close when authenticated
    // process.exit()
}

run()
