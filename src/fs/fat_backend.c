/* FAT32 implementation/ABI preserved; only this binding knows concrete names. */
#include "../storage/storage.h"
const struct fs_backend fat32_backend={"FAT32",fat_info,fat_error,fat_list,fat_read,fat_write,fat_remove,fat_sync,fat_stat,fat_list_path,fat_read_at,fat_write_at,fat_mkdir,fat_rmdir,fat_rename,fat_copy};
