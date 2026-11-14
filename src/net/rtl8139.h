#ifndef SLOPIX_RTL8139_H
#define SLOPIX_RTL8139_H
#include <stdint.h>
/* Polling-only QEMU RTL8139 driver; no IRQ ownership or DMA from userspace. */
int rtl8139_init(void);
int rtl8139_ready(void);
const uint8_t *rtl8139_mac(void);
int rtl8139_send(const uint8_t *frame,unsigned bytes);
void rtl8139_poll(void (*receive)(const uint8_t*,unsigned));
#endif
