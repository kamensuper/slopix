FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends build-essential grub-common grub-pc-bin xorriso qemu-system-x86 python3 python3-pil curl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV CARGO_HOME=/opt/cargo RUSTUP_HOME=/opt/rustup
ENV PATH="/opt/cargo/bin:${PATH}"
RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o /tmp/rustup.sh && sh /tmp/rustup.sh -y --profile minimal --default-toolchain 1.85.1 --target x86_64-unknown-none --no-modify-path && rm /tmp/rustup.sh
WORKDIR /src
CMD ["make"]
