#ifndef SLOPIX_HTTP_H
#define SLOPIX_HTTP_H
#include <stddef.h>
#include <stdint.h>
/* Strict HTTP/1.0 response parser. Transport-independent; no TLS or sockets. */
struct http_response {
 unsigned status;
 size_t header_bytes,body_bytes;
 int chunked,content_length_present;
 size_t content_length;
 char location[256];
};
/* On success return decoded HTML body size; otherwise -71 malformed, -90 too
 * large, -95 unsupported transfer-encoding. No allocation is performed. */
int http_decode_body(const unsigned char *buf,size_t len,const struct http_response *meta,
                     unsigned char *out,size_t capacity);
int http_parse_response(const unsigned char *buf,size_t len,struct http_response *out);
int http_parse_url(const char *url,char *host,size_t hostcap,char *path,size_t pathcap,unsigned *port);
int http_make_request(const char *host,const char *path,char *out,size_t cap);
#endif
