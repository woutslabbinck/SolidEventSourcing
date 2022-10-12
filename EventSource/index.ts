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

import {readFileSync} from "fs";
import {Session} from "@rubensworks/solid-client-authn-isomorphic"
import {turtleStringToStore, LDESinLDPConfig, storeToString, extractTimestampFromLiteral} from "@treecg/versionawareldesinldp"
import {getTimeStamp, Resource} from "./src/EventSourceUtil";
import {naiveAlgorithm} from "./src/algorithms/Naive";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";
import { Literal, Quad_Subject, Store } from "n3";
const loglevel ="info"
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

    // Retrieve data points and put them into resources
    // Note this is currently hard coded -> this should actually be done with code that can read a container of long vs short chats
    // const file = readFileSync('../data/output/rml_output.ttl', 'utf-8')
    const file = readFileSync(fileName, 'utf-8')
    const store = await turtleStringToStore(file)

    // extract every resource based on the subject, where
    // the subject has the predicate treePath
    let mainSubjects : Quad_Subject[] | Set<string> = store.getSubjects(
        treePath, null, null
    );
    const sourceResources = mainSubjects.map(subject => {
        return store.getQuads(subject, null, null, null) as Resource
    });
    mainSubjects = new Set(mainSubjects.map(subj => subj.id));
    // as these values have a timestamp defined using the treePath, sorting can
    // be applied on this data
    const getTime = (resource: Resource) : number => {
        // as the shape of a resource can vary, this
        // approach is flexible
        return extractTimestampFromLiteral(
            new Store(resource).getObjects(
                // at this time, all quads in the resource
                // should use the same subject, so
                // subject of the first quad suffices
                resource[0].subject, treePath, null
            )[0] as Literal
        );
    }
    sourceResources.sort((first, second) => {
        return getTime(first) - getTime(second);        
    });
    // it's possible for any of resource's object values to be an
    // object further defined here, if that is the case they get
    // added to this resource
    for (const [i, quads] of sourceResources.entries()) {
        // to avoid issues with data referencing themselves in a circle,
        // duplicates are filtered out as well
        // the initial subject (there should only be one still) is added
        // as an initial to-be-ignored object
        const existingObjects = new Set<string>(quads[0].subject.id);
        for (const quad of quads) {
            if (existingObjects.has(quad.object.id)) {
                continue;
            }
            existingObjects.add(quad.object.id);
            // all quads with subjects equal to its object representation
            // gets added to this resource entry, so the original subjects'
            // data is completely present inside this single resource
            // this approach already works recursively, as push adds new elements
            // to the end, making them appear as subjects in further
            // iterations
            // quads having another main resource (that is not the current resource)
            // as object are getting filtered out as well, as they cannot be further
            // defined within this single resource
            sourceResources[i].push(
                ...store.getQuads(quad.object, null, null, null).filter((obj) => {
                    return obj.object.id === sourceResources[i][0].subject.id || !((mainSubjects as Set<string>).has(obj.object.id))
                })
            );
        }
    }
    if (sourceResources.length === 0) {
        logger.info(`No valid source data found. Exiting...`);
        return;
    }
    // grouping resources from sourceResources together based on size of a single resource and the target resource
    // size
    // assume every sourceResource entry is of the same length (on average) to calculate the number of resources
    // that are to be grouped together
    const resourceGroupCount = 1 + Math.floor(targetResourceSize / storeToString(new Store(sourceResources[0])).length);
    // the samples in a single group are automatically correctly ordered, as they are
    // sorted in the sourceResources collection above
    const resources = Array.from(Array(Math.floor(sourceResources.length / resourceGroupCount) + 1), () => new Array());
    for (const [i, resource] of sourceResources.entries()) {
        resources[Math.floor(i / resourceGroupCount)].push(...resource);
    }
    if (resources[resources.length - 1].length === 0) {
        // drop the last one if empty (can happen in some scenarios)
        resources.length -= 1;
    }

    let amountResources: number = amount
    // if input is not a number use the entire collection
    if (isNaN(amount)) {
        amountResources = resources.length
    }

    const config: LDESinLDPConfig = {
        LDESinLDPIdentifier: lilURL,
        treePath: treePath,
    }

    logger.info(`Data file used: ${fileName}`)
    logger.info(`LDES in Solid URL: ${lilURL}`)
    logger.info(`Version Identifier: ${versionIdentifier}`)
    logger.info(`Timestamp path: ${treePath}`)
    logger.info(`Resources per UUID: ${resourceGroupCount}`)
    let session: Session;
    if (credentialsFileName !== "None") {
        const credentials = JSON.parse(readFileSync(process.argv[6], 'utf-8'));
        session = new Session();
        await session.login({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            refreshToken: credentials.refreshToken,
            oidcIssuer: credentials.issuer,
        });
        logger.info(`User logged in: ${session.info.webId}`)

    }
    logger.info("Naive algorithm: Execution for " + amountResources + " resources with a bucket size of " + bucketSize);
    await naiveAlgorithm(lilURL, resources.slice(0, amountResources), versionIdentifier, bucketSize, config, session, loglevel);
    // Note: currently removed as otherwise no time will be used. Now it might not close when authenticated
    // process.exit()
}

run()
