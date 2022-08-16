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
import {turtleStringToStore, LDESinLDPConfig} from "@treecg/versionawareldesinldp"
import {Resource} from "./src/EventSourceUtil";
import {naiveAlgorithm} from "./src/algorithms/Naive";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";
const loglevel ="info"
const logger = new Logger("EventSource", loglevel)

async function run() {
    const resources: Resource[] = []
    const fileName = process.argv[2]
    const lilURL = process.argv[3]
    const versionIdentifier = process.argv[4]
    const amount = parseInt(process.argv[5], 10)
    const credentialsFileName = process.argv[6]
    const treePath = process.argv[7]

    // Retrieve data points and put them into resources
    // Note this is currently hard coded -> this should actually be done with code that can read a container of long vs short chats
    // const file = readFileSync('../data/output/rml_output.ttl', 'utf-8')
    const file = readFileSync(fileName, 'utf-8')
    const store = await turtleStringToStore(file)
    const time_subjects: any[] = []

    store.getSubjects(process.argv[7], null, null).forEach(subject => {
        time_subjects.push(subject)
    });

    for (const subject of time_subjects) {
        // add observation to resource
        let quads = store.getQuads(subject, null, null, null);

        // add featureOfInterest to resource
        const feats = store.getQuads(subject, 'http://www.w3.org/ns/sosa/hasFeatureOfInterest', null, null);
        feats.forEach((interst) => {
            quads = quads.concat(
                store.getQuads(interst.object, null, null, null)
            );
        });

        // add result to resource
        const results = store.getQuads(subject, 'http://www.w3.org/ns/sosa/hasResult', null, null);
        results.forEach((res) => {
            quads = quads.concat(
                store.getQuads(res.object, null, null, null)
            );
        });

        // add location to resource
        const location = store.getQuads(subject, 'http://www.w3.org/ns/sosa/observedProperty', null, null);
        location.forEach((loc) => {
            quads = quads.concat(
                store.getQuads(loc.object, null, null, null)
            );
        });

        // add sensor to resource
        const sensor = store.getQuads(subject, 'http://www.w3.org/ns/sosa/madeBySensor', null, null);
        sensor.forEach((sens) => {
            // we dont want show all the observations the sensor made in every resource, only the one that matters
            quads.push(store.getQuads(sens.object, 'http://www.w3.org/ns/sosa/madeObservation', subject, null)[0]);
            // take all quads and filter out all madeBySensor quads
            const all_sens = store.getQuads(sens.object, null, null, null);
            const diff = all_sens.filter(x => x.predicate.value !== 'http://www.w3.org/ns/sosa/madeObservation');
            quads = quads.concat(diff);

            // add platform to resource
            const platform = store.getQuads(sens.object, 'http://www.w3.org/ns/sosa/isHostedBy', null, null);
            platform.forEach((plat) => {
                quads = quads.concat(
                    store.getQuads(plat.object, null, null, null)
                );
            });
        });

        resources.push(quads)
    }


    const bucketSize = 100
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
