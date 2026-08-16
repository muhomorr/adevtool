TARGET_BOARD_PLATFORM := laguna

include vendor/adevtool/config/mk/google_devices/common/device-common-gs201-plus.mk

AB_OTA_POSTINSTALL_CONFIG += FILESYSTEM_TYPE_system=ext4

PRODUCT_SOONG_NAMESPACES += vendor/adevtool/config/mk/google_devices/platform/laguna

TRUSTY_KEYMINT_IMPL := rust

PRODUCT_PACKAGES += GosOverlay

PRODUCT_PACKAGES += init.laguna.grapheneos.rc

PRODUCT_CHECK_VENDOR_SEAPP_VIOLATIONS := true
PRODUCT_CHECK_DEV_TYPE_VIOLATIONS := true

PRODUCT_NO_BIONIC_PAGE_SIZE_MACRO := true
