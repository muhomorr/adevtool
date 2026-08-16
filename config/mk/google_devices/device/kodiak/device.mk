$(call inherit-product, vendor/adevtool/config/mk/google_devices/platform/malibu/product-common.mk)

TARGET_KERNEL_DIR ?= device/google/spacecraft-kernels/6.12/grapheneos/spacecraft

include vendor/adevtool/config/mk/google_devices/platform/malibu/device.mk
