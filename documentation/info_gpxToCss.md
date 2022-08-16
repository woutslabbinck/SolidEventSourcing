# Info on manually running the GPX subcommand

## 1 Clean

See [`info_gpx.md`](info_gpx.md)

## 2 Pre-process

See [`info_gpx.md`](info_gpx.md)

## 3 Yarrrml-parser

See [`info_gpx.md`](info_gpx.md)

## 4 RMLMapper

See [`info_gpx.md`](info_gpx.md)

## 5 CSS

The last step is calling the `CSS/index.ts` which will place the data onto the pod (`outputurl`) without much structure.

```sh
npx ts-node CSS/index.ts data/output/rml_output.ttl outputurl
```
