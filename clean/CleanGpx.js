const xml2js = require('xml2js');
const fs = require('fs')

const inputFileName = process.argv[2];
const fileName = process.argv[3];
const fileString = fs.readFileSync(inputFileName).toString();
xml2js.parseString(fileString, (err, result) => {
    // remove xlmns as for some reason RML does not work then
    delete result.gpx.$.xmlns
    const builder = new xml2js.Builder()
    const xml = builder.buildObject(result)
    fs.writeFileSync(fileName, xml)
})
