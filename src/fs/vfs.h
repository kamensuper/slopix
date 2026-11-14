#ifndef SLOPIX_VFS_H
#define SLOPIX_VFS_H
#include <stdint.h>
#include <stddef.h>
#define FS_MAX_FILE 65536u
struct fs_info {uint32_t sectors,clusters,free_clusters,cluster_bytes;int mounted,writable;};
/* Main-thread-only backend. Backend and callbacks have static kernel lifetime. */
struct fs_backend {
 const char*name;
 struct fs_info(*info)(void);const char*(*error)(void);
 int(*list)(void(*entry)(const char*,uint32_t,int));
 int(*read)(const char*,void*,uint32_t,uint32_t*);
 int(*write)(const char*,const void*,uint32_t);
 int(*remove)(const char*);int(*sync)(void);
 int(*stat)(const char*,uint32_t*,int*);
 int(*list_path)(const char*,void(*)(const char*,uint32_t,int));
 int(*read_at)(const char*,uint32_t,void*,uint32_t,uint32_t*);
 int(*write_at)(const char*,uint32_t,const void*,uint32_t);
 int(*mkdir)(const char*);int(*rmdir)(const char*);
 int(*rename)(const char*,const char*);int(*copy)(const char*,const char*);
};
int vfs_bind(const struct fs_backend*backend);
const char*vfs_name(void);
struct fs_info vfs_info(void);
const char*vfs_error(void);
int vfs_list(void(*entry)(const char*,uint32_t,int));
int vfs_read(const char*,void*,uint32_t,uint32_t*);
int vfs_write(const char*,const void*,uint32_t);
int vfs_remove(const char*);
int vfs_sync(void);
/* Bounded streaming API: paths <=255 bytes, 8.3 components, depth <=16.
 * write_at uses streaming append at EOF and copy-on-write for other writes.
 * rename is within one directory; copy refuses existing destinations. */
int vfs_stat(const char *path,uint32_t *size,int *directory);
int vfs_list_path(const char *path,void (*entry)(const char *,uint32_t,int));
int vfs_read_at(const char *path,uint32_t offset,void *buffer,uint32_t capacity,uint32_t *size);
int vfs_write_at(const char *path,uint32_t offset,const void *buffer,uint32_t size);
int vfs_mkdir(const char *path);
int vfs_rmdir(const char *path);
int vfs_rename(const char *from,const char *to);
int vfs_copy(const char *from,const char *to);
#endif
