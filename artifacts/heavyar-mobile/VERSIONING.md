# Heavyar mobile versioning

The permanent Heavyar mobile identities begin at version `1.1.0`, Android
version code `1`, and iOS build number `1`. These counters must only increase;
they must never be reset after a native build is distributed or tested through
the permanent `com.heavyar.app` identities.

EAS uses local version sourcing so every build is reproducible from the
committed `app.json`. Increment the marketing version and both native counters
together for each future native release.