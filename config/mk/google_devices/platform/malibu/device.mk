TARGET_BOARD_PLATFORM := malibu

include vendor/adevtool/config/mk/google_devices/common/device-common-gs201-plus.mk

AB_OTA_POSTINSTALL_CONFIG += FILESYSTEM_TYPE_system=erofs

PRODUCT_SOONG_NAMESPACES += vendor/adevtool/config/mk/google_devices/platform/malibu

TRUSTY_KEYMINT_IMPL := rust

PRODUCT_PACKAGES += GosOverlay

PRODUCT_PACKAGES += init.malibu.grapheneos.rc

PRODUCT_CHECK_VENDOR_SEAPP_VIOLATIONS := true
PRODUCT_CHECK_DEV_TYPE_VIOLATIONS := true

PRODUCT_NO_BIONIC_PAGE_SIZE_MACRO := true

# TODO These overlays are needed to avoid framework-res.apk resource ID mismatches. Remove them
# after 11th gen Pixels are unified with the rest of Pixels.
DEVICE_PACKAGE_OVERLAYS += \
	vendor/adevtool/config/mk/google_devices/platform/malibu/overlay-excluded-from-enforce-rro-targets

PRODUCT_ENFORCE_RRO_EXCLUDED_OVERLAYS += \
	vendor/adevtool/config/mk/google_devices/platform/malibu/overlay-excluded-from-enforce-rro-targets
