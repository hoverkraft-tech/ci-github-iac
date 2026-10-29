FROM debian:trixie-slim@sha256:f6b08b09a05725f9431502d3b5714f5c4576e82c1a84fa1debe0c24a7e0c3ec4

# hadolint ignore=DL3008
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt /opt/requirements.txt
RUN python3 -m venv /opt/ansible && /opt/ansible/bin/pip install --no-cache-dir -r /opt/requirements.txt
ENV PATH="/opt/ansible/bin:${PATH}"
USER 1000:1000
HEALTHCHECK CMD ["ansible-playbook", "--version"]
