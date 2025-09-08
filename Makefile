.PHONY: build archive clean help

IMAGE_NAME := test-system-status
IMAGE_TAG := latest
ARCHIVE_NAME := test-system-status-oci.tar
PLATFORMS := linux/aarch64

build:
	@echo "Building Docker image $(IMAGE_NAME):$(IMAGE_TAG) for ARM64..."
	docker buildx build --platform $(PLATFORMS) -t $(IMAGE_NAME):$(IMAGE_TAG) -f Dockerfile --load .

archive: build
	@echo "Creating OCI archive $(ARCHIVE_NAME)..."
	docker save $(IMAGE_NAME):$(IMAGE_TAG) -o $(ARCHIVE_NAME)
	@echo "OCI archive created: $(ARCHIVE_NAME)"


all: archive

clean:
	@echo "Removing Docker image and OCI archive..."
	-docker rmi $(IMAGE_NAME):$(IMAGE_TAG)
	-rm -f $(ARCHIVE_NAME)
	@echo "Cleanup complete"
