import { extractTimestampFromLiteral, TREE, turtleStringToStore } from "@treecg/versionawareldesinldp";
import { Quad, Quad_Subject, Store, DataFactory, Literal } from "n3";
const namedNode = DataFactory.namedNode;
import { Resource } from "./EventSource";
import { existsSync, readFileSync } from "fs";

/**
 * Returns all the triples as a store from a file at a given filepath
 *  note: This method can throw depending on the file(path)
 * @param filepath
 * @returns {Promise<Store>}
 */
export async function storeFromFile(filepath: string): Promise<Store> {
    if (!existsSync(filepath)){
        throw Error("The filepath is invalid.");
    }
    // if the file content is invalid, the method below will throw a
    // different error
    return await turtleStringToStore(readFileSync(filepath, "utf-8"));
}

/**
 * Extracts all resources (along referenced data) containing the given treePath as a predicate
 * from the given store, and adds relevant tree:member data.
 * 
 * @param store The store containing all triples (as well as relevant referenced data)
 * @param treePath Predicate which every "main" subject contains (e.g. "http://purl.org/dc/terms/created")
 * @param eventStreamURI Complete name of the stream where individual resources gets added to (e.g. http://localhost:3000/#EventStream)
 * @returns {Resource[]}
 */
 export function extractResources(
    store: Store,
    treePath: string,
    eventStreamURI: string
): Resource[] {
    // extract every resource based on the subject, where the subject has the predicate
    // treePath
    let mainSubjects: Quad_Subject[] | Set<string> = store.getSubjects(
        treePath, null, null
    );
    const resources = mainSubjects.map(subject => {
        // extract triples based on subject
        const resource = store.getQuads(subject, null, null, null) as Resource;
        // add tree:member
        resource.push(new Quad(namedNode(eventStreamURI), namedNode(TREE.member), subject));
        return resource;
    });
    mainSubjects = new Set(mainSubjects.map(subj => subj.id));
    // it's possible for any of resource's object values to be an object further defined here,
    // if that is the case they get added to this resource
    for (const quads of resources) {
        // to avoid issues with data referencing themselves in a circle, duplicates are filtered
        // out (alongside the current subject)
        const existingObjects = new Set<string>();
        existingObjects.add(quads[0].subject.id);
        for (const quad of quads) {
            if (existingObjects.has(quad.object.id)) {
                continue;
            }
            existingObjects.add(quad.object.id);
            // all quads with subjects equal to its object representation gets added to this
            // resource entry, so the original subjects' data is completely present inside this
            // single collection of resources
            // this approach already works recursively, as push adds new elements to the end
            // quads having another main resource (that is not the current resource) as object
            // are getting filtered out as well, as they are not further defined
            quads.push(
                ...store.getQuads(quad.object, null, null, null).filter((obj) => {
                    return obj.object.id === quads[0].subject.id || !((mainSubjects as Set<string>).has(obj.object.id))
                })
            );
        }
    }
    return resources;
}

/**
 * Batches resources together, reducing the size of the top level array (array of resources)
 * by increasing the size of the bottom level array (array of quads in a single resource)
 * It is important that resources are already properly sorted (if relevant) prior to batching
 * as the order is preserved
 * 
 * @param source original collection of resources
 * @param count number of resources that should be grouped together
 * @returns {Resource[]} a (smaller) collection of resources, containing every quad from the
 * original source
 */
 export function batchResources(source: Resource[], count: number): Resource[] {
    if (count < 1) {
        // Invalid, returning the original collection
        return source;
    }
    const resources = Array.from(
        Array(Math.floor(source.length / count) + 1), () => new Array()
    );
    for (const [i, resource] of source.entries()) {
        resources[Math.floor(i / count)].push(...resource);
    }
    if (resources[resources.length - 1].length === 0) {
        // drop the last one if empty (can happen in some scenarios)
        resources.length -= 1;
    }
    return resources;
}
