# First naive algorithm
Goal: adding some resources to an already existing LDES

## step 1: check whether ldes is initialised
If LDES not initialised -> initialise

##  step 2: add all resources to correct bucket
* calculate correct bucket for each resources
* save in key-values store? <bucketURL, Resources[]>

**Properties**: 

* have a non-existing bucket URL that contains all the resources that appeared before the current first relation timestamp
* Calculate from those buckets the first resource

## step 3: rebalance

**X** = configured bucket size

T1: time of bucket itself (GTE, thus all resources timestamps are larger than T1)

T2: time of 'next' bucket (all resources in bucket should be smaller than that one)

go over each bucket over the LDES that has more than **X** resources and create new buckets such that at the end there are less than **X** per bucket.

**3a**: Calculate new buckets for each resource

**Last bucket behaviour**:

**Y** resources, thus Z = ((Y - 1) / X)+1 buckets

The first Z -1 buckets must all have 100 resources. The last just the rest

*Note to self:* why shouldn't all the others follow this same strategy as well?

**Other bucket behaviour**

Evenly distributed?

**3b**: Create new buckets

**3c**: Copy resources to new buckets

**3d**: Add relations to root and remove old resources

* **Inbox** might have to move!!

Insights after reading the book

Optional: **3e**: check bucket again to verify that all resource are within interval [T1,T2) and # resources are less than **X** (this is an issue where some other progress has been adding resources to the bucket while we were  busy rebalancing)

Possible issue for real scalability: There may only be one rebalancing happening within a bucket at a time. Otherwise this algorithm will break

## Results

```bash
Algorithm A execution time for 1413 resources with a bucket size of 100
LDP Container created: http://localhost:3000/lil/
LDP Container created: http://localhost:3000/lil/1654699222716/
Time of oldest resource: 2020-03-21T09:19:53.000Z |  in ms: 1584782393000
Number of resources not belonging to any bucket: 1413
Creating new container at http://localhost:3000/lil/1584782393000/ for those resources.
LDP Container created: http://localhost:3000/lil/1584782393000/
There are 0 resources in the container, which is less than or equal to the amount allowed per container (100).
Rebalance time for container http://localhost:3000/lil/1654699222716/ which has 0 resources.: 46.114ms
There are 1413 resources in the container, which is greater than the amount allowed per container (100).
Balancing is starting now.
Rebalance time for container http://localhost:3000/lil/1584782393000/ which has 1413 resources.: 2:23.483 (m:ss.mmm)
Time for Algorithm A: 3:07.424 (m:ss.mmm)


```

Second try:

```bash
2022-06-09T15:09:55.188Z [naiveAlgorithm] info: naiveAlgorithm total execution took 184042 ms to complete
2022-06-09T15:09:55.187Z [naiveAlgorithm] info: step 1: init ldes took 290 ms to complete
2022-06-09T15:09:55.188Z [naiveAlgorithm] info: step 2: add all resources to the containers took 47096 ms to complete
2022-06-09T15:09:55.188Z [naiveAlgorithm] info: step 3: rebalance the LDES in LDP took 136656 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: rebalanceContainer total execution for http://localhost:3000/lil_test/1584782393000/ (1413 resources) took 136609 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: Preparation: fetch all resources in the container and sort them by date took 51260 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: step a: calculate buckets took 22 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: step b: create containers for the buckets took 505 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: step c: copy resources in the new containers took 27669 ms to complete
2022-06-09T15:09:55.188Z [rebalanceContainer] info: step d: cleanup (add relations to the root and remove moved resources) took 57153 ms to complete
```

Low-hanging fruit: Clearly the number of HTTP requests. When optimising try to limit HTTP requests and still make sense of the members

Note: versionAwareLDES in LDP implementation of get might not work anymore then? (e.g. the read a certain resource? TODO: test)

## Possible optimisations

* **LIMIT number of HTTP requests:** allow for ldp:resources to have a certain window as well (that way they can have multiple data points as well)
  * constraint parameters for resource window:
    * time window before a resource is sent (e.g. 10 secs)
    * max number of data points per resource (e.g. 50 data points per resources)
  * PROs:
    * less HTTP requests
    * vAware LIL algorithm can still be used for the time windows of the relations, inbox for new resources still work
  * CONs
    * No more exact idea of how many data points are in one container (not based on # of contains anymore)
    * Rebalancing might be more difficult?
* **Better algorithm** **(Also limiting the amount of HTTP requests)** (probably difficult)
  * Algorithm A puts resources first into the right 'buckets' and then rebalances
  * Another algorithm (B) could combine this step so there is no temporarely lots of resources in the buckets

* **Finetuning parameters of algorithm** 
  * **bucketSize**
  * **Resources per batch**
* **Virtual containers**
  * **(limiting amount of HTTP GET requests**

# Nautirust poging 1

```json
{
    "id": "xmlToKafka",
    "runnerId": "JsRunner",
    "config": {
        "jsFile": "file.js",
        "methodName": "xmlToKafka"
    },
    "args": [
        {
            "id": "xmlToKafkaInputStream",
            "type": "streamReader",
            "sourceIds": [
                "data"// verwijst naar dictionary gedefinieerd in file.js
            ] 
        },
        {
            "id": "xmlToKafkaOutputStream",
            "type": "streamWriter",
            "targetIds": ["data"]
        }
    ]
}
```

Nautirust:

Nautirust

* leest steps en maakt grote config

```shell
cd ~/Documents/repos/nautirust-configs
./nautirust generate -o run.json ../LocationMapper/NautirustSteps/xmlToKafka.json 
```

* voert grote config file uit
```shell
cd ~/Documents/repos/nautirust-configs
./nautirust run run.json
```
Nautirust runner (config)

* Runners die nautirust gebruik om processors uit te voeren
  * staan in de nautirust-configs repo
  * gebruikt git submodules om al de runners in te laden
### Demo
[test](https://comunica.github.io/comunica-feature-link-traversal-web-clients/builds/solid-default/#datasources=;http%3A%2F%2Flocalhost%3A3000%2Flil_test%2F&query=PREFIX%20sosa%3A%20%3Chttp%3A%2F%2Fwww.w3.org%2Fns%2Fsosa%2F%3E%0ASELECT%20*%20WHERE%20%7B%20%20%20%0A%20%20%3Fs%20a%20sosa%3AObservation%3B%0A%20%20sosa%3AhasSimpleResult%20%3Floc%20%3B%20%20%0A%20%20sosa%3AresultTime%20%3Fdatetime%7D%20%0AORDER%20BY%20DESC(%3Fdatetime)%0A&solidIdp=https%3A%2F%2Fwoslabbi.pod.knows.idlab.ugent.be%2F)

