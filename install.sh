#!/bin/bash

# install deps for cleaning
cd clean
npm i
cd ..

# install deps for EventSource and build versionawareldesinldp
cd EventSource
npm i

# download rmlmapper
cd ../RML/
if [[ ! -f "rmlmapper-5.0.0-r362-all.jar" ]]; then
    wget https://github.com/RMLio/rmlmapper-java/releases/download/v5.0.0/rmlmapper-5.0.0-r362-all.jar
fi

# install yarrrml parser and tsnode
cd ..
npm i @rmlio/yarrrml-parser
npm i ts-node
