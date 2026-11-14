/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef SLOPIX_STORAGE_H
#define SLOPIX_STORAGE_H
#include <stdint.h>
#include <stddef.h>
#include "../fs/vfs.h"
struct block_device {
    uint32_t sectors;
    int (*read)(uint32_t lba,void *buffer);
    int (*write)(uint32_t lba,const void *buffer);
    int (*flush)(void);
};
struct block_device *ata_init(void);
int fat_mount(struct block_device *device);
struct fs_info fat_info(void);
const char *fat_error(void);
int fat_list(void (*entry)(const char *name,uint32_t size,int directory));
int fat_read(const char *name,void *buffer,uint32_t capacity,uint32_t *size);
int fat_write(const char *name,const void *buffer,uint32_t size);
int fat_remove(const char *name);
int fat_sync(void);
/* Bounded streaming API: paths <=255 bytes, 8.3 components, depth <=16.
 * write_at uses streaming append at EOF and copy-on-write for other writes.
 * rename is within one directory; copy refuses existing destinations. */
int fat_stat(const char *path,uint32_t *size,int *directory);
int fat_list_path(const char *path,void (*entry)(const char *,uint32_t,int));
int fat_read_at(const char *path,uint32_t offset,void *buffer,uint32_t capacity,uint32_t *size);
int fat_write_at(const char *path,uint32_t offset,const void *buffer,uint32_t size);
int fat_mkdir(const char *path);
int fat_rmdir(const char *path);
int fat_rename(const char *from,const char *to);
int fat_copy(const char *from,const char *to);
#endif
