// currently you need to install it yourself inside nodemodules (don't forget to build it)
import {Extractor} from "@treecg/ldes-extractor";
import {createReadStream} from "fs";
import {Store} from "n3";
export async function storeToLinestring(store: Store): Promise<string> {
    // load the ldes store
    const extractor = new Extractor(store);

    // create the extract at a given time
    const extract = await extractor.create({
        startDate: new Date("2019-10-05T10:19:55Z"),
        endDate: new Date("2023-10-07T09:19:55Z"),
        ldesIdentifier: "http://location.example.com/ldess",
    })

    const points: String[][] = [];
    let linestr: String = "LINESTRING("
    extract.forEach((member) => {
        member.quads.forEach(quad => {
            if (quad.predicate.value === "http://www.w3.org/ns/sosa/hasSimpleResult") {
                const lat = quad.object.value.replace(/POINT\((.*) (.*)\)/, "$1");
                const long = quad.object.value.replace(/POINT\((.*) (.*)\)/, "$2");
                points.push([lat, long]);
                linestr += `${lat} ${long}, `
            }
        })
    })
    linestr = linestr.slice(0, linestr.length - 2);
    linestr += ")";
    return linestr.toString();
}
async function script() {
    const rdfParser = require("rdf-parse").default;
    const storeStream = require("rdf-store-stream").storeStream;

    //                              input file with observation
    const ldesString = createReadStream(process.argv[2]);
    const quadStream = rdfParser.parse(ldesString, {contentType: 'text/turtle'});
    const store = await storeStream(quadStream);
    console.log(await storeToLinestring(store));
}
script()
