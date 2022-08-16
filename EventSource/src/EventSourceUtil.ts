import {
    extractTimestampFromLiteral,
    LDESMetadata,
    LDPCommunication,
    storeToString
} from "@treecg/versionawareldesinldp";
import {DataFactory, Literal, Quad, Store} from "n3";

const {quad, namedNode} = DataFactory

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
    let correspondingUrl
    for (const relation of relations) {
        const relationTs: number = new Date(relation.value).getTime()
        if (relationTs <= resourceTs && timestampJustSmaller < relationTs) {
            timestampJustSmaller = relationTs
            correspondingUrl = relation.node
        }
    }
    if (!correspondingUrl) {
        correspondingUrl = "none"
    }
    return correspondingUrl
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
export async function addResourcesToBuckets(bucketResources: BucketResources, metadata: LDESMetadata, ldpComm: LDPCommunication) {
    for (const containerURL of Object.keys(bucketResources)) {
        for (const resource of bucketResources[containerURL]) {
            const resourceStore = new Store(resource)
            const response = await ldpComm.post(containerURL, storeToString(resourceStore))
            // console.log(`Resource stored at: ${response.headers.get('location')} | status: ${response.status}`)
            // TODO: handle when status is not 201 (Http Created)
        }
    }
}
