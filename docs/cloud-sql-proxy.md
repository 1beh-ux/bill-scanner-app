# Cloud SQL Auth Proxy (local DB access)

The proxy binary is **not** in the repository any more (it was a 32 MB committed file, removed 2026-11-05;
it stays in old history until someone runs `git filter-repo`). The helper scripts use `~/cloud-sql-proxy`.

Download (Linux x86-64), into your home folder:

```bash
curl -o ~/cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.1/cloud-sql-proxy.linux.amd64
chmod +x ~/cloud-sql-proxy
~/cloud-sql-proxy --version
```

Other platforms / newer versions: https://cloud.google.com/sql/docs/postgres/sql-proxy#install

Run (the helpers in `~/claude-helpers` do this): `~/cloud-sql-proxy --gcloud-auth --port 55434 prvni-beh-filesaver:europe-west3:bill-scanner-db`.
