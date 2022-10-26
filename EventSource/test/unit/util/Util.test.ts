import {Communication, LDES, LDESMetadata, LDP, RDF, TREE, XSD} from "@treecg/versionawareldesinldp";
import {convertLdesMetadata, editMetadata} from "../../../src/util/Util";
import {Literal} from "n3";

describe('A util', () => {
    const lilURL = 'http://solidPod.example.org/'
    const eventStreamURL = `${lilURL}#EventStream`

    describe('converting LDES metadata to a Store', () => {

        it('returns a correct store.', () => {
            const exampleURL = 'http://example.org/'
            const date = new Date()

            const fragmentURL = lilURL + date.getTime()
            const timestampPath = `${exampleURL}timestamp`
            const versionOfPath = `${exampleURL}versionOf`
            const metadata: LDESMetadata = {
                deletedType: "", // doesn't matter
                inbox: fragmentURL,
                ldesEventStreamIdentifier: eventStreamURL,
                timestampPath,
                versionOfPath,
                views: [{
                    id: lilURL,
                    relations: [{
                        node: fragmentURL,
                        path: `${exampleURL}timestamp`,
                        type: TREE.GreaterThanOrEqualToRelation,
                        value: date.toISOString()
                    }]
                }]
            }

            const store = convertLdesMetadata(metadata)
            expect(store.countQuads(null, null, null, null)).toBe(11)

            // Event Stream
            expect(store.countQuads(eventStreamURL, null, null, null)).toBe(4)
            expect(store.getObjects(eventStreamURL, RDF.type, null)[0].value).toEqual(LDES.EventStream)
            expect(store.getObjects(eventStreamURL, LDES.timestampPath, null)[0].value).toEqual(timestampPath)
            expect(store.getObjects(eventStreamURL, LDES.versionOfPath, null)[0].value).toEqual(versionOfPath)
            expect(store.getObjects(eventStreamURL, TREE.view, null)[0].value).toEqual(lilURL)

            // View
            expect(store.countQuads(lilURL, null, null, null)).toBe(3)
            expect(store.getObjects(lilURL, RDF.type, null)[0].value).toEqual(TREE.Node)

            // Relation
            const relationBlankNode = store.getObjects(lilURL, TREE.relation, null)[0]
            expect(store.countQuads(relationBlankNode, null, null, null)).toBe(4)
            expect(store.getObjects(relationBlankNode, RDF.type, null)[0].value).toEqual(TREE.GreaterThanOrEqualToRelation)
            expect(store.getObjects(relationBlankNode, TREE.path, null)[0].value).toEqual(timestampPath)
            expect(store.getObjects(relationBlankNode, TREE.node, null)[0].value).toEqual(fragmentURL)
            const treeValueLiteral = store.getObjects(relationBlankNode, TREE.value, null)[0] as Literal
            expect(treeValueLiteral.value).toEqual(date.toISOString())
            expect(treeValueLiteral.datatype.value).toEqual(XSD.dateTime)

            // Inbox
            expect(store.getObjects(lilURL, LDP.inbox, null)[0].value).toEqual(fragmentURL)
        });
    });
    describe('to edit metadata', () => {
        let mockCommunication: jest.Mocked<Communication>
        beforeEach(() => {
            mockCommunication = {
                delete: jest.fn(),
                head: jest.fn(),
                get: jest.fn(),
                patch: jest.fn(),
                post: jest.fn(),
                put: jest.fn()
            }
        });

        it('succeeds when the metadata is edited.', async () => {
            const response = new Response(null, {status: 205})
            mockCommunication.patch.mockResolvedValueOnce(response)
            await expect(editMetadata(lilURL, mockCommunication, "")).resolves.toBeUndefined()
        });

        it('throws error when the metadata could not be edited.', async () => {
            const response = new Response(null, {status: 400})
            mockCommunication.patch.mockResolvedValueOnce(response)
            await expect(() =>editMetadata(lilURL, mockCommunication, "")).rejects.toThrowError()
        });
    });
});
