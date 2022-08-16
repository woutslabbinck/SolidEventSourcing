// import { SolidFetchBuilder } from "../Bashlib/bashlib/css/src"

import { readFileSync, readdirSync } from "fs";
import { Quad, Store, Writer } from "n3";

// Note unauthenticated does not really work
// async function attemptBashlib(){
//     // currently no authentication being used
//     const builder = new SolidFetchBuilder();

//     builder.buildInteractive({idp:"https://broker.pod.inrupt.com/"})
//     const fetch = builder.getFetch()!
//     console.log(fetch);

//     const response = await fetch("http://localhost:3000/")
//     console.log(await response.text())
// }

// Util functions
import { ParseOptions } from "rdf-parse/lib/RdfParser";
import { METHODS } from "http";
import { timeEnd } from "console";

const rdfParser = require("rdf-parse").default;
const storeStream = require("rdf-store-stream").storeStream;
const streamifyString = require("streamify-string");

function storeToString(store: Store): string {
    const writer = new Writer();
    return writer.quadsToString(store.getQuads(null, null, null, null));
}
async function turtleStringToStore(
    text: string,
    baseIRI?: string
): Promise<Store> {
    return await stringToStore(text, { contentType: "text/turtle", baseIRI });
}

async function stringToStore(
    text: string,
    options: ParseOptions
): Promise<Store> {
    const textStream = streamifyString(text);
    const quadStream = rdfParser.parse(textStream, options);
    return await storeStream(quadStream);
}

async function fileAsStore(path: string, contentType?: string): Promise<Store> {
    contentType = contentType ? contentType : "text/turtle";
    const text = readFileSync(path, "utf8");
    return await stringToStore(text, { contentType });
}

/**
 * Reads in all points in ../data/output and returns them as Quad[][] with a Quad[] containing the data about the points
 */
async function readPoints(): Promise<Quad[][]> {
    const store = new Store();
    const path: string = process.argv[2];
    const file = readFileSync(path, "utf-8");

    const partStore = await turtleStringToStore(file);
    store.addQuads(partStore.getQuads(null, null, null, null));

    const points: Quad[][] = [];
    store
        .getObjects(null, "http://www.w3.org/ns/sosa/madeObservation", null)
        .forEach((object) => {
            points.push(store.getQuads(object, null, null, null));
        });

    return points;
}

async function createPointShortResources(
    points: Quad[][],
    containerURL: string
): Promise<void> {
    // parallel does not really work well
    // const calls = []
    // for (const pointQuad of points) {
    //   const body = storeToString(new Store(pointQuad))
    //   calls.push(fetch(containerURL, {
    //     method: "POST",
    //     body
    //    }))
    // }
    // console.log(calls.length);
    // await Promise.all(calls)

    // sequential
    for (const pointQuad of points) {
        const body = storeToString(new Store(pointQuad));
        await fetch(containerURL, {
            method: "POST",
            body,
        });
    }
}

// long resource, all at once
async function createPointLongResource(
    points: Quad[][],
    containerURL: string
): Promise<void> {
    const body = storeToString(new Store(points.flat()));
    await fetch(containerURL, {
        method: "POST",
        body,
    });
}
// long resource, all sequential patches
async function createPointLongResourcePatches(
    points: Quad[][],
    resourceURL: string
): Promise<void> {
    for (const pointQuad of points) {
        const string = storeToString(new Store(pointQuad));
        const body = `INSERT DATA { ${string} }`;
        await fetch(resourceURL, {
            method: "PATCH",
            headers: {
                "content-type": "application/sparql-update",
            },
            body,
        });
    }
}

const baseURL = process.argv[3];
const shortContainerURL = baseURL + "short/";
const longContainerURL = baseURL + "long/";
const longResourceURL = longContainerURL + "location.ttl";
// create either short or long resources  with points
async function run() {
    const points = await readPoints();

    // make short container
    await fetch(shortContainerURL, {
        method: "PUT",
        headers: { "content-type": "text/turtle" },
    });
    // make long container
    await fetch(longContainerURL, {
        method: "PUT",
        headers: { "content-type": "text/turtle" },
    });

    console.time(shortContainerURL);

    await createPointShortResources(points, shortContainerURL);
    console.timeEnd(shortContainerURL);
    // ~35s

    console.time(longContainerURL);

    await createPointLongResource(points, longContainerURL);
    console.timeEnd(longContainerURL);
    // ~.1s

    console.time(longResourceURL);
    // await createPointLongResourcePatches(points, longResourceURL)
    console.timeEnd(longResourceURL);
    // 2:26 m -> 146s
}

// TODO: other script that reads all points in a container and structures it to an event source
run();
