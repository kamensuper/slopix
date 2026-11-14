#ifndef SLOPIX_NET_STACK_H
#define SLOPIX_NET_STACK_H
#include <stdint.h>
#include <stddef.h>
void net_init(void);
void net_poll(void);
int net_ready(void);
/* Bounded synchronous HTTP GET. Returns body bytes, or negative error:
 * -19 NIC absent, -22 invalid URL, -101 route, -110 timeout,
 * -71 protocol, -90 response too large, -95 unsupported transfer encoding.
 * Requests allow only plain HTTP; no TLS, no claims of HTTPS support. */
int net_http_get(const char *url,uint8_t *out,unsigned capacity);
void net_report(void (*line)(const char*));
/* Host-verifiable Internet checksum. */
uint16_t net_checksum(const uint8_t *data,unsigned bytes);
#endif
