TARGET_BOARD_PLATFORM := zuma

include vendor/adevtool/config/mk/google_devices/common/device-common-gs201-plus.mk

AB_OTA_POSTINSTALL_CONFIG += FILESYSTEM_TYPE_system=ext4

PRODUCT_SOONG_NAMESPACES += vendor/adevtool/config/mk/google_devices/platform/zuma

TRUSTY_KEYMINT_IMPL := rust

PRODUCT_PACKAGES += GosOverlay

PRODUCT_PACKAGES += init.zuma.grapheneos.rc

PRODUCT_NO_BIONIC_PAGE_SIZE_MACRO := true

