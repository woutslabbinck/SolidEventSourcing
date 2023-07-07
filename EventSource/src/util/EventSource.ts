import {
    DCT,
    extractTimestampFromLiteral,
    ILDESinLDPMetadata,
    LDPCommunication,
    turtleStringToStore
} from "@treecg/versionawareldesinldp";
import {DataFactory, Literal, Quad, Quad_Object, Store, Writer} from "n3";
import {existsSync, readFileSync} from "fs";
import {Session} from "@rubensworks/solid-client-authn-isomorphic";

const namedNode = DataFactory.namedNode;

// The semantics of Resource is the data point itself (!! not to be confused with an ldp:Resource)
export type Resource = Quad[]
// a dictionary which maps an ldp:containerURL to an array of Resources
export type BucketResources = { [p: string]: Resource[] }

/**
 * @param credentialsFile Filepath to a JSON containing credentials to setup a
 * Solid communication session
 * @returns {Promise<Session | undefined>}
 */
export async function initSession(credentialsFilepath: string): Promise<Session | undefined> {
    if (existsSync(credentialsFilepath)) {
        const credentials = JSON.parse(readFileSync(credentialsFilepath, 'utf-8'));
        const session = new Session();
        await session.login({
            clientId: credentials.clientId,
            clientSecret: credentials.clientSecret,
            refreshToken: credentials.refreshToken,
            oidcIssuer: credentials.issuer,
        });
        return session;
    }
    return undefined;
}

/**
 * Calculates to which bucket (i.e. the ldp:Container) the resource should be added.
 * When the returned url is none, this means the resource its timestamp is less than all current bucket timestamps.
 * @param resource
 * @param metadata
 * @returns {string}
 */
export function calculateBucket(resource: Resource, metadata: ILDESinLDPMetadata): string {
    const relations = metadata.view.relations
    const resourceTs = getTimeStamp(resource, metadata.view.relations[0].path ?? DCT.created)

    let timestampJustSmaller = 0
    let correspondingUrl = "none";
    for (const relation of relations) {
        const relationTs: number = new Date(relation.value).getTime()
        if (relationTs <= resourceTs && timestampJustSmaller < relationTs) {
            timestampJustSmaller = relationTs
            correspondingUrl = relation.node
        }
    }
    return correspondingUrl;
}

/**
 * The new container URL is calculated based on the container URL where too many resources reside and a timestamp
 * @param containerURL
 * @param timestamp
 */
export function createBucketUrl(containerURL: string, timestamp: number) {
    const split = containerURL.split('/')
    return `${split.slice(0, split.length - 2).join('/')}/${timestamp}/`
}

/**
 * Retrieve timestamp of a resource (ms)
 * @param resource
 * @param timestampPath
 * @returns {number}
 */
export function getTimeStamp(resource: Resource, timestampPath: string): number {
    const resourceStore = new Store(resource)
    return extractTimestampFromLiteral(resourceStore.getObjects(null, timestampPath, null)[0] as Literal)// Note: expecting real xsd:dateTime
}

export async function prefixesFromFilepath(path: string, url?: string): Promise<any> {
    let prefixes: { [key: string]: string } = {};
    if (url) {
        prefixes[""] = url + "#";
    }
    if (existsSync(path)) {
        const store = await turtleStringToStore(readFileSync(path, "utf-8"));
        // only the triples using predicate "<http://purl.org/vocab/vann/preferredNamespacePrefix>"
        // are relevant, as these represent prefix (= object) and URI (= subject)
        const prefixQuads = store.getQuads(null, namedNode("http://purl.org/vocab/vann/preferredNamespacePrefix"), null, null);
        for (const prefixQuad of prefixQuads) {
            if (prefixQuad.object.termType != "Literal" || !/^"[^"]+"$/.test(prefixQuad.object.id)) {
                // the object does not represent a string literal, skipping this entry
                continue;
            }
            prefixes[prefixQuad.object.value] = prefixQuad.subject.value;
        }
    }
    return prefixes;
}

/**
 * Converts a resource (quad array) to an optimised turtle string representation by grouping subjects
 * together, using prefixes wherever possible and replacing blank nodes with their properties.
 * Note: blank nodes referenced to as objects, but not found as subjects in other quads, can cause
 *  issues
 * Note: a more processing performant solution might be possible, by creating a store from the resource
 *  and indexing from there instead of two seperate maps
 *
 * @param resource The resource that gets converted to a string
 * @param _prefixes An object which members are strings, member name being the short prefix and its
 *  value a string representing its URI. Example: `{"rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"}`
 * @returns {string}
 */
export function resourceToOptimisedTurtle(resource: Resource, _prefixes: any): string {
    // get a grouped overview of this resource's content
    const named = new Map<string, Map<string, Quad_Object[]>>();
    const blank = new Map<string, Map<string, Quad_Object[]>>();
    addElements:
        for (const quad of resource) {
            const data = quad.subject.termType == "BlankNode" ? blank : named;
            if (data.has(quad.subject.id)) {
                const props = data.get(quad.subject.id)!;
                if (props.has(quad.predicate.id)) {
                    // check if value is already in array, if it is, dont add it anymore
                    const objs = props.get(quad.predicate.id)!;
                    for (const obj of objs) {
                        // while it might offer better performance to use a set instead
                        // of an array, the custom type Quad_Object would not work correctly
                        // with Set.has(), and thus would require a seperate container storing
                        // the IDs (which would in turn not be memory efficient)
                        if (obj.equals(quad.object)) {
                            continue addElements;
                        }
                    }
                    objs.push(quad.object);
                } else {
                    props.set(quad.predicate.id, new Array(quad.object));
                }
            } else {
                data.set(quad.subject.id, new Map([[quad.predicate.id, new Array(quad.object)]]));
            }
        }
    // converting all the entries of the blank map first
    // with the ordered view done, a more compact turtle string can be generated
    const writer = new Writer({prefixes: _prefixes});
    for (const [subject, properties] of named) {
        for (const [predicate, objects] of properties) {
            for (const object of objects) {
                if (object.termType != "BlankNode") {
                    writer.addQuad(namedNode(subject), namedNode(predicate), object);
                } else {
                    const blankProperties = blank.get(object.id)!;
                    for (const [blankPredicate, blankObjects] of blankProperties) {
                        for (const blankObject of blankObjects) {
                            writer.addQuad(
                                namedNode(subject), namedNode(predicate),
                                writer.blank(namedNode(blankPredicate), blankObject)
                            );
                        }
                    }
                }
            }
        }
    }
    let str: string = "";
    writer.end((_, result) => str = result);
    return str;
}

/**
 * Adds all the resources from each bucket entry of the BucketResources object to the specified container
 * Note: currently does not do any error handling
 *  handling should be something in the line of collecting all the resources that were added OR trying to add them again?
 *
 * @param bucketResources
 * @param metadata
 * @param ldpComm
 * @returns {Promise<void>}
 */
export async function addResourcesToBuckets(bucketResources: BucketResources, metadata: ILDESinLDPMetadata, ldpComm: LDPCommunication, prefixes: any) {
    for (const containerURL of Object.keys(bucketResources)) {
        for (const resource of bucketResources[containerURL]) {
            const response = await ldpComm.post(containerURL, resourceToOptimisedTurtle(resource, prefixes))
            // console.log(`Resource stored at: ${response.headers.get('location')} | status: ${response.status}`)
            // TODO: handle when status is not 201 (Http Created)
        }
    }
}
