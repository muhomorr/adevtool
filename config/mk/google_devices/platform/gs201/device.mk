TARGET_BOARD_PLATFORM := gs201

include vendor/adevtool/config/mk/google_devices/common/device-common-gs201-plus.mk

AB_OTA_POSTINSTALL_CONFIG += FILESYSTEM_TYPE_system=ext4

PRODUCT_SOONG_NAMESPACES += vendor/adevtool/config/mk/google_devices/platform/gs201

PRODUCT_PACKAGES += GosOverlay

PRODUCT_PACKAGES += init.gs201.grapheneos.rc

