# CP04 verification report — 2026-10-19

**Source baseline:** provided `slopix-1.0-genesis-checkpoint03-source(1).zip`.

| Test | Outcome |
|---|---|
| `make genesis-cp04-net-test` HTTP parser | PASS (host) |
| IPv4 Internet checksum | PASS (host) |
| Full simulated RTL8139 → ARP → DNS → TCP → HTTP request and response | PASS (host mock) |
| Browser local HTML, HTTP URL link parsing | PASS (host) |
| Actual SlopBrowse input handlers with mocked HTTP fetch | PASS (host) |
| Ring-3 ELF loading/reclaim of DEMO/BROWSE/HELLOGUI | PASS (host) |
| FAT32 `.slop` package install and uninstall, byte verification | PASS (host) |
| `.slop` v1/v2 archive CRC and malicious input tests | PASS (host) |
| Kernel/DOOM C object compilation | PASS |
| Full kernel link / bootable ISO | BLOCKED (rustc not installed) |
| Real QEMU Ethernet, DNS, HTTP fetch | NOT RUN (QEMU not installed) |
| HTTP/TCP behavior under packet loss | NOT VERIFIED |
| HTTPS / valid TLS | NOT IMPLEMENTED |
| Ring-3 migration of legacy DOOM/Terminal | NOT IMPLEMENTED |

One live-guest acceptance criterion: QEMU NIC logs `NET_RTL8139_READY`,
SlopBrowse loads `http://10.0.2.2:8000/TEST.HTM` from a real Fedora
Python `http.server`, `NET_HTTP_OK` appears in serial output, and the title
`REAL HTTP FROM SLOPIX!` is displayed in the browser. The present host tests
do **not** establish that the criterion passed.
