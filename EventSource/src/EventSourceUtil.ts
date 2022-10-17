import {
    extractTimestampFromLiteral,
    LDESMetadata,
    LDPCommunication
} from "@treecg/versionawareldesinldp";
import {Literal, Quad, Quad_Object, Store} from "n3";

// The semantics of Resource is the data point itself (!! not to be confused with an ldp:Resource)
export type Resource = Quad[]
// a dictionary which maps an ldp:containerURL to an array of Resources
export type BucketResources = {[p: string]: Resource[]}

/**
 * Calculates to which bucket (i.e. the ldp:Container) the resource should be added.
 * When the returned url is none, this means the resource its timestamp is less than all current bucket timestamps.
 * @param resource
 * @param metadata
 * @returns {string}
 */
export function calculateBucket(resource: Resource, metadata: LDESMetadata): string {
    const relations = metadata.views[0].relations
    const resourceTs = getTimeStamp(resource, metadata.timestampPath)

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


type ResourceMap = Map<string, Map<string, Quad_Object[]>>;

/**
 * Converts a resource (quad array) to two maps, where every key is a subject ID.
 * The maps are split depending on wether the subject node is a named node or a
 * blank node
 * Note: currently duplicate objects are not checked. As most functions
 *  use this method to optimise the utilized space, it might be beneficial to remove
 *  duplicate objects here as well
 * @param resource
 * @returns {[ResourceMap, ResourceMap]}
 */
export function resourceToMaps(resource: Resource): [ResourceMap, ResourceMap] {
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
    return [named, blank];
}

const invalidPrefixCharacters = ["/", ":"];

/**
 * Converts a quad-subj/pred/obj ID to a potentially shorter version by using a compatible prefix;
 * otherwise a turtle friendly version is returned
 * @param original
 * @returns {string}
 */
export function tryApplyPrefix(original: string, prefixes: any): string {
    // the string might either be a direct value (e.g. saref:hasValue)
    // or represent a literal (e.g. "0.0"^^xsd:float), can be checked
    // by looking for regex
    if (/\"[^"]*\"\^\^[^\^]+/.test(original)) {
        // only checking after the ^^ for prefixes
        const str = original.substring(original.indexOf("^^") + 2);
        for (const prefix in prefixes) {
            if (str.startsWith(prefixes[prefix])) {
                const substr = str.substring(prefixes[prefix].length);
                if (!invalidPrefixCharacters.some(char => substr.includes(char))) {
                    return `${original.substring(0, original.indexOf("^^") + 2)}${prefix}:${substr}`;
                }
            }
        }
        return `${original.substring(0, original.indexOf("^^") + 2)}<${str}>`;
    } else {
        for (const prefix in prefixes) {
            if (original.startsWith(prefixes[prefix])) {
                const substr = original.substring(prefixes[prefix].length);
                if (!invalidPrefixCharacters.some(char => substr.includes(char))) {
                    return `${prefix}:${substr}`;
                }
            }
        }
        return `<${original}>`;
    }
}

/**
 * Converts a resource (quad array) to an optimised turtle string representation by grouping subjects
 * together, using prefixes wherever possible and replacing blank nodes with their properties.
 * Note: blank nodes referenced as objects, but not found as subjects in other quads, are removed
 *  entirely
 *
 * @param resource The resource that gets converted to a string
 * @param prefixes An object which members are strings, member name being the short prefix and its
 *  value a string representing its URI. Example: `{"rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#"}`
 * @param skipPrefixDecl If no \@prefix x: <y> . on the top is required, this can be set to true
 * @returns {string}
 */
export function resourceToOptimisedTurtle(resource: Resource, prefixes: any, skipPrefixDecl: boolean = false): string {
    // get a grouped overview of this resource's content
    const [named, blank] = resourceToMaps(resource);
    // with the ordered view done, a more compact turtle string can be generated
    // adding all the prefixes to the string first
    // using an array of strings, as manipulating the same string over and over again
    // is slow
    const result = [];
    if (!skipPrefixDecl) {
        let prefixText = "";
        for (const prefix in prefixes) {
            prefixText += `@prefix ${prefix}: <${prefixes[prefix]}> .\n`;
        }
        result.push(prefixText);
    }
    for (const [subj, props] of named) {
        let currentString = tryApplyPrefix(subj, prefixes) + " ";
        for (const [pred, objs] of props) {
            currentString += tryApplyPrefix(pred, prefixes) + " ";
            for (const obj of objs) {
                if (obj.termType == "BlankNode" && blank.has(obj.id)) {
                    const blankProps = blank.get(obj.id)!;
                    currentString += '[\n';
                    for (const [blankProp, blankVal] of blankProps) {
                        // these blank values should not be blank
                        // nodes themselves, so adding them here
                        // instead
                        currentString += "\t\t" +
                            tryApplyPrefix(blankProp, prefixes) +
                            ' ' +
                            blankVal.map(val =>
                                tryApplyPrefix(val.id, prefixes)
                            ).join(", ") +
                            " ;\n";
                    }
                    currentString += '\t]';
                } else {
                    // simply mentioning this blank node, as no further
                    // information about it can be added
                    currentString += tryApplyPrefix(obj.id, prefixes);
                }
                currentString += ' , ';
            }
            currentString = currentString.substring(0, currentString.length - 3) + " ;\n\t";
        }
        currentString = currentString.substring(0, currentString.length - 4) + " .";
        result.push(currentString);
    }
    return result.join("\n");
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
export async function addResourcesToBuckets(bucketResources: BucketResources, metadata: LDESMetadata, ldpComm: LDPCommunication, prefixes: any) {
    for (const containerURL of Object.keys(bucketResources)) {
        for (const resource of bucketResources[containerURL]) {
            const response = await ldpComm.post(containerURL, resourceToOptimisedTurtle(resource, prefixes))
            // console.log(`Resource stored at: ${response.headers.get('location')} | status: ${response.status}`)
            // TODO: handle when status is not 201 (Http Created)
        }
    }
}
