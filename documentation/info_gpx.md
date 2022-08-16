# Info on manually running the GPX subcommand

## 1 Clean

First the input data gets cleaned using:

```sh
node clean/CleanGpx.js INPUTDATA data/cleaned.xml
```

## 2 Pre-process

Then the yarrrml file gets preprocessed and the user inputted urls get injected in that file. This is done in `script.py`.
Relevant snippet:

```python
with open(args['yarrrmlpath'], 'r') as file:
    data = file.read()
    output = data.replace('PERSONURL', args['person_url'])
    if args['transport_mode'] == None:
        output = output.replace(
            '      - [tm:transportMode, TRANSPORTMODE]\n', '')
    else:
        output = output.replace('TRANSPORTMODE', args['transport_mode'])
    output = output.replace('DEVICEURL', args['device'])
    output = output.replace('SENSORURL', args['sensor'])
    output = output.replace('VERSIONURL', args['versionId'])
    with open('RML/track_points_copy.yaml', 'w') as outputfile:
        outputfile.write(output)
```

This snippet:

-   Deletes TRANSPORTMODE, if none was given or injects the url if one was given.
-   Injects PERSONURL.
-   Injects DEVICEURL.
-   Injects SENSORURL.
-   Injects VERSIONURL.
-   Writes to `track_points_copy.yaml`.

In this file you also need to set where the gpx data will come from, in our case that is `data/cleaned.xml`.
So you will need to replace `data/test.xml` in the `track_points_copy.yaml` file to the file you created in the clean step.

## 3 Yarrrml-parser

Afterwards that yarrrml file is passed to the yarrrml-parser:

```sh
npx yarrrml-parser -i RML/track_points_copy.yaml -o RML/mapping.ttl -p
```

## 4 RMLMapper

Then the RMLMapper with use that mappingfile and the cleaned inputdata to create a turtle file:

```sh
java -jar RML/rmlmapper-5.0.0-r362-all.jar -m RML/mapping.ttl -o data/output/rml_output.ttl
```

## 5 EventSource

At last the `rml_output` file and some user args will be passed to EventSource and the resouces will be placed on the Solid pod as an [LDES in Solid](https://woutslabbinck.github.io/LDESinLDP).
An LDES in Solid is an attempt at creating a time-versioned Linked Data Event Stream ([LDES](https://semiceu.github.io/LinkedDataEventStreams/)) on a Solid pod.
So with LDES in Solid we can use the LDP API to **read** and **append** to an LDES.

```sh
npx ts-node EventSource/index.ts data/output/rml_output.ttl LDESinSolidURL versionId amount authenticationFile timestamppath
```
