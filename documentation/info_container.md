# Info on manually running the container subcommand

The script just calls `EventSource/containterToLil.ts`:

```sh
npx ts-node EventSource/containterToLil.ts -r rooturl -o outputurl -V versionId -t treePath -a authfile -l loglevel
```
