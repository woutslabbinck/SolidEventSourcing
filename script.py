#!/bin/python3
import argparse
from argparse import RawTextHelpFormatter
import subprocess
import time
import os
# deps: argparse, rmlmapper


def removeTempFiles(list):
    for path in list:
        try:
            os.unlink(path)
        except:
            print(f'Removing {path} did not execute properly.')
        

# Parse arguments
parser = argparse.ArgumentParser(
    description='LocationMapper', formatter_class=RawTextHelpFormatter)
subparsers = parser.add_subparsers(dest="subcommand", required=True)
gpx_parser = subparsers.add_parser('gpx')
gpx_parser.add_argument('-i', '--input',
                        help='input gpx file', required=True)
gpx_parser.add_argument('-au', '--authenticated',
                        help='Is the server authenticated? If so enable this flag and link the path to credentials file \n(This file can be created by running `ts-node EventSource/loginCreds.ts`)', required=False)
gpx_parser.add_argument('-V', '--versionId',
                        help='versionIdentifier', required=True)
gpx_parser.add_argument('-a', '--amount',
                        help='amount of points that will get used (default: all)', default='NaN', required=False)
gpx_parser.add_argument('-r', '--rmlmapper',
                        help='path to the RMLMapper jar\n(should look something like path/to/rmlmapper-5.0.0-r362-all.jar)\nIf you ran the install script (install.sh) then you can leave this on default', required=False, default='RML/rmlmapper-5.0.0-r362-all.jar')
gpx_parser.add_argument('-u', '--person-url',
                        help='your profile url e.g. https://woslabbi.pod.knows.idlab.ugent.be/profile/card#me', required=True)
gpx_parser.add_argument('-t', '--transport-mode',
                        help='the transport-mode the data was captured with, e.g. tm:Walking', required=False)
gpx_parser.add_argument('-d', '--device',
                        help='the url of the device that did the measurements', required=True)
gpx_parser.add_argument('-ss', '--sensor',
                        help='the url of the sensor inside the device that did the measurements', required=True)
gpx_parser.add_argument('-ti', '--timestamppath',
                        help='The timestamppath for the ldes (default: http://www.w3.org/ns/sosa/resultTime)', required=False, default='http://www.w3.org/ns/sosa/resultTime')
gpx_parser.add_argument('-l', '--LDESinSolidURL',
                        help='The URL of the LDES in Solid (which is an ldp:Container thus should end with an "/")\nThe output will be put in this container', required=False)
gpx_parser.add_argument('-y', '--yarrrmlpath',
                        help='Path to the yarrrml file (default: RML/track_points.yaml)', required=False, default='RML/track_points.yaml')

con_parser = subparsers.add_parser('container')

con_parser.add_argument(
    "-r", "--rooturl", help="rooturl where container is located", required=True)
con_parser.add_argument("-o", "--outputurl",
                        help="outputurl where ordered data will be placed", required=True)
con_parser.add_argument("-V", "--versionId",
                        help="versionIdentifier", required=True)
con_parser.add_argument(
    "-t", "--treePath", help="treePath (default: http://www.w3.org/ns/sosa/resultTime)", default="http://www.w3.org/ns/sosa/resultTime)")
con_parser.add_argument(
    "-a", "--authfile", help="authentication configfile (default: None, this mean the solid server is unauthenticated)")
con_parser.add_argument("-l", "--loglevel", default="info",
                        help="level of logging (info debug error trace warn) (default: info)")


css_parser = subparsers.add_parser('css')

css_parser.add_argument(
    "-i", "--inputfile", help="input file", required=True)
css_parser.add_argument(
    "-o", "--outputurl", help="output url", required=True)


linestr_parser = subparsers.add_parser('linestr')

linestr_parser.add_argument(
    "-i", "--inputfile", help="input file", required=True)


gpxToCss_parser = subparsers.add_parser('gpxToCss')

gpxToCss_parser.add_argument('-i', '--input',
                             help='input gpx file', required=True)
gpxToCss_parser.add_argument(
    "-o", "--outputurl", help="output url", required=True)
gpxToCss_parser.add_argument('-r', '--rmlmapper',
                             help='path to the RMLMapper jar\n(should look something like path/to/rmlmapper-5.0.0-r362-all.jar)\nIf you ran the install script (install.sh) then you can leave this on default', required=False, default='RML/rmlmapper-5.0.0-r362-all.jar')
gpxToCss_parser.add_argument('-V', '--versionId',
                             help='versionIdentifier', required=True)
gpxToCss_parser.add_argument('-u', '--person-url',
                             help='your profile url e.g. https://woslabbi.pod.knows.idlab.ugent.be/profile/card#me', required=True)
gpxToCss_parser.add_argument('-t', '--transport-mode',
                             help='the transport-mode the data was captured with, e.g. tm:Walking', required=False)
gpxToCss_parser.add_argument('-d', '--device',
                             help='the url of the device that did the measurements', required=True)
gpxToCss_parser.add_argument('-ss', '--sensor',
                             help='the url of the sensor inside the device that did the measurements', required=True)
gpxToCss_parser.add_argument('-y', '--yarrrmlpath',
                             help='Path to the yarrrml file (default: RML/track_points.yaml)', required=False, default='RML/track_points.yaml')

args = vars(parser.parse_args())

cleanedFilePath = "clean.xml"
generatedYarrmlFilePath = "RML/track_points_generated.yaml"

if args['subcommand'] == 'gpx':
    # Insert urls into yaml
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
        with open(generatedYarrmlFilePath, 'w') as outputfile:
            outputfile.write(output)


# Run cleaning on arguments
    cleantime = time.perf_counter_ns()
    subprocess.run(["node", "clean/CleanGpx.js",
                   args['input'], cleanedFilePath])
    print(
        f'Cleaning took: {round((time.perf_counter_ns() - cleantime)/1000000)}ms')

# Generate mapping file
    yarrrmltime = time.perf_counter_ns()
    subprocess.run(["npx", "yarrrml-parser", "-i", generatedYarrmlFilePath,
                   "-o", "RML/mapping.ttl", "-p"])
    print(
        f'Yarrrml parsing took: {round((time.perf_counter_ns() - yarrrmltime)/1000000)}ms')

# Use mapping file and convert with rmlmapper
    rmlmappingtime = time.perf_counter_ns()
    subprocess.run(["java", "-jar", args['rmlmapper'],
                   "-m", "RML/mapping.ttl", "-o", "location.ttl"])
    print(
        f'RMLMapping took: {round((time.perf_counter_ns() - rmlmappingtime)/1000000)}ms')

    if args['timestamppath'] is None or args['LDESinSolidURL'] is None:
        print(
            "Skipping EventSource step because arguments weren't set, required arguments for this step: [--LDESinSolidURL, --timestamppath]")
    else:
        # Make sure urls are correct
        if args['LDESinSolidURL'][-1] != '/':
            args['LDESinSolidURL'] += '/'
        # Transforming Timestamped Linked Data location points to time-based versioned LDES (in LDP)
        ldestime = time.perf_counter_ns()
        subprocess.run(["npx", "ts-node", "EventSource/index.ts", "location.ttl",
                       args['LDESinSolidURL'], args['versionId'], args['amount'], str(args['authenticated']), args['timestamppath']])
        print(
            f'LDES took: {round((time.perf_counter_ns() - ldestime)/1000000)}ms')

    print(
        f'Total time: {round((time.perf_counter_ns() - cleantime)/1000000)}ms')
    removeTempFiles([cleanedFilePath, generatedYarrmlFilePath])

elif args['subcommand'] == 'container':
    subprocess.run(["npx", "ts-node", "EventSource/containterToLil.ts", "-r", args['rooturl'], "-o", args['outputurl'],
                   "-V", args['versionId'], "-t", args['treePath'], "-a", str(args['authfile']), "-l", args['loglevel']])
elif args['subcommand'] == 'css':
    subprocess.run(["npx", "ts-node", "CSS/index.ts",
                   args['inputfile'], args['outputurl']])
elif args['subcommand'] == 'linestr':
    subprocess.run(["npx", "ts-node", "linestring.ts", args['inputfile']])
elif args['subcommand'] == 'gpxToCss':
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
        with open(generatedYarrmlFilePath, 'w') as outputfile:
            outputfile.write(output)
    subprocess.run(["node", "clean/CleanGpx.js",
                   args['input'], cleanedFilePath])
    subprocess.run(["npx", "yarrrml-parser", "-i", generatedYarrmlFilePath,
                   "-o", "RML/mapping.ttl", "-p"])
    subprocess.run(["java", "-jar", args['rmlmapper'],
                   "-m", "RML/mapping.ttl", "-o", "location.ttl"])
    subprocess.run(["npx", "ts-node", "CSS/index.ts",
                    "location.ttl", args['outputurl']])
    removeTempFiles([cleanedFilePath, generatedYarrmlFilePath])
