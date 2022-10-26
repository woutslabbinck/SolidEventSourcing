import fetch from "node-fetch";
import {Store} from "n3";
import {
    turtleStringToStore,
    LDESConfig, DCT,
} from "@treecg/versionawareldesinldp";
import {naiveAlgorithm} from "./src/algorithms/Naive";
import {Session} from "@rubensworks/solid-client-authn-isomorphic";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";

const fs = require("fs");
const {ArgumentParser} = require("argparse");
const cliProgress = require('cli-progress');

const parser = new ArgumentParser({
    description: 'Container to LIL'
});

parser.add_argument("-r", "--rooturl", {
    help: "rooturl where container is located",
});
parser.add_argument("-o", "--outputurl", {
    help: "outputurl where ordered data will be placed",
});
parser.add_argument("-V", "--versionId", {help: "versionIdentifier"});
parser.add_argument("-t", "--treePath", {
    help: "treePath (e.g. http://www.w3.org/ns/sosa/resultTime)",
});
parser.add_argument("-a", "--authfile", {help: "auth configfile"});
parser.add_argument("-l", "--loglevel", {default: "info", help: "level of logging (info debug error trace warn)"});

const args = parser.parse_args();

async function run() {
    let logger = new Logger(run.name, args["loglevel"]);
    const authConfigPath = args["authfile"];

    const rooturl: string = args["rooturl"];

    let fet = fetch;
    let session: Session | undefined = undefined;
    if (authConfigPath !== "None") {
        const credentials = JSON.parse(fs.readFileSync(authConfigPath, "utf-8"));
        logger.info(`Using authenticated fetch (configfile: ${authConfigPath})`)
        session = new Session();
        await session.login({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            refreshToken: credentials.refreshToken,
            oidcIssuer: credentials.issuer,
        });
        // @ts-ignore (the fetch is the same, typing is just slightly different?)
        fet = session.fetch;
    }

    const resp = await fet(rooturl);
    if (resp.status !== 200) {
        throw new Error(
            `Cannot fetch rooturl, status: ${resp.status}, statusText: ${resp.statusText}`
        );
    }

    const store: Store = await turtleStringToStore(await resp.text());

    const quads = store.getQuads(
        null,
        "http://www.w3.org/ns/ldp#contains",
        null,
        null
    );
    logger.info(`Found ${quads.length} quads`);
    const resources = [];
    const bar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    bar.start(quads.length, 0);
    for (let quad of quads) {
        // get turtle resource
        const observation_url = rooturl + quad.object.value;
        const resp = await fet(observation_url);

        if (resp.status !== 200) {
            logger.info(`Couldn't fetch resource: ${observation_url}, status: ${resp.status} ${resp.statusText}`)
        }
        const resource = await resp.text();

        const resourceStore = await turtleStringToStore(resource, rooturl + quad.object.value);
        const resourceQuads = resourceStore.getQuads(null, null, null, null);
        resources.push(resourceQuads);
        bar.increment();
    }
    bar.stop();
    logger.info(`Found ${resources.length} resources`);
    const lilURL = args["outputurl"];
    const versionIdentifier = args["versionId"];
    const bucketSize = 100;

    const config: LDESConfig = {
        LDESinLDPIdentifier: lilURL,
        treePath: args["treePath"],
        versionOfPath: DCT.isVersionOf // TODO: needs proper argument
    };

    logger.info("Algorithm A execution for " + resources.length + " resources with a bucket size of " + bucketSize);
    await naiveAlgorithm(
        lilURL,
        resources,
        versionIdentifier,
        bucketSize,
        config,
        session
    );
    // process.exit(0);
}
run();
