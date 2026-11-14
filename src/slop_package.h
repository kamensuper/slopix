#ifndef SLOPIX_PACKAGE_H
#define SLOPIX_PACKAGE_H
/* Non-POSIX flat executable package format, ABI 1, versioned and bounded.
 * All operations run on the kernel main thread, using the FAT32 VFS. */
int slop_package_command(const char *name,char *arguments,void (*out)(const char *));
#endif
