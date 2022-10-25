// TODO: util has to be moved to LdesUtil of the package VersionAwareLIL
import {Communication, LDES, LDESMetadata, LDP, RDF, storeToString, TREE, XSD} from "@treecg/versionawareldesinldp";
import {DataFactory, Store} from "n3";
import {Logger} from "@treecg/versionawareldesinldp/dist/logging/Logger";
const {quad, namedNode, literal} = DataFactory

/**
 * Convert the ldes metadata object back to an N3 Store
 * @param metadata
 * @returns {Store}
 */
export function convertLdesMetadata(metadata: LDESMetadata): Store {
    const metadataStore = new Store()
    // LDES itself
    metadataStore.addQuad(quad(namedNode(metadata.ldesEventStreamIdentifier), RDF.terms.type, LDES.terms.EventStream))
    metadataStore.addQuad(quad(namedNode(metadata.ldesEventStreamIdentifier), LDES.terms.timestampPath, namedNode(metadata.timestampPath)))
    metadataStore.addQuad(quad(namedNode(metadata.ldesEventStreamIdentifier), LDES.terms.versionOfPath, namedNode(metadata.versionOfPath)))
    // Root node
    const rootnode = metadata.views[0]
    metadataStore.addQuad(quad(namedNode(metadata.ldesEventStreamIdentifier), TREE.terms.view, namedNode(rootnode.id)))
    metadataStore.addQuad(quad(namedNode(rootnode.id), RDF.terms.type, TREE.terms.Node))

    // relations
    const relations = rootnode.relations
    for (const relation of relations) {
        const bn = metadataStore.createBlankNode()

        metadataStore.addQuad(quad(namedNode(rootnode.id), TREE.terms.relation, bn))

        metadataStore.addQuad(bn, RDF.terms.type, namedNode(relation.type))
        metadataStore.addQuad(bn, TREE.terms.node, namedNode(relation.node))
        metadataStore.addQuad(bn, TREE.terms.path, namedNode(metadata.timestampPath))
        metadataStore.addQuad(bn, TREE.terms.value, literal(relation.value, XSD.terms.dateTime))
    }
    // inbox
    metadataStore.addQuad(quad(namedNode(rootnode.id), LDP.terms.inbox, namedNode(metadata.inbox)))
    return metadataStore
}

export async function editMetadata(resourceIdentifier: string, communication: Communication, body: string): Promise<void> {
    const logger = new Logger(editMetadata.name)
    const response = await communication.patch(resourceIdentifier + '.meta', body)
    if (response.status !== 205) {
        logger.error("Something went wrong when trying to patch the root. This MUST NOT HAPPEN")
        logger.error("Body that should have been inserted: " + body)
        logger.error(await response.text())
        throw new Error("Something went wrong when trying to patch the root")
    }
}
