SHELL := /bin/bash
.DEFAULT_GOAL := help

HOST_UID := $(shell id -u)
HOST_GID := $(shell id -g)

.PHONY: help lint-fix ci test lint docs
help: ## Display help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

test: ## Run unit tests
	node --test tests/*.test.cjs

lint: ## Execute linting
	$(call run_linter,)

lint-fix: ## Execute linting and fix
	$(call run_linter, \
		-e FIX_BIOME_FORMAT=true \
		-e FIX_BIOME_LINT=true \
		-e FIX_SPELL_CODESPELL=true \
		-e FIX_MARKDOWN=true \
		-e FIX_MARKDOWN_PRETTIER=true \
		-e FIX_YAML_PRETTIER=true \
		-e FIX_NATURAL_LANGUAGE=true \
		-e FIX_SHELL_SHFMT=true \
	)

ci: ## Execute local CI tasks
	$(MAKE) lint-fix
	$(MAKE) test

docs: ## Generate action documentation
	npm exec --yes --package=@ci-dokumentor/cli@0.5.0 -- ci-dokumentor generate --source actions/vm/create/action.yml actions/vm/test/action.yml actions/vm/destroy/action.yml --repository git
	# Ansible is not in the latest release; its metadata supplies a reviewed commit example.
	npm exec --yes --package=@ci-dokumentor/cli@0.5.0 -- ci-dokumentor generate --source actions/ansible/test/action.yml --repository git --exclude-sections usage

#############################
# Helpers
#############################
define run_linter
	@set -eu; \
	DEFAULT_WORKSPACE="$(CURDIR)"; \
	LINTER_IMAGE="ci-github-iac-linter:latest"; \
	VOLUME="$$DEFAULT_WORKSPACE:$$DEFAULT_WORKSPACE"; \
	DEFAULT_BRANCH="$$(git -C "$$DEFAULT_WORKSPACE" rev-parse --abbrev-ref HEAD)"; \
	docker build --platform=linux/amd64 \
		--build-arg UID=$(HOST_UID) --build-arg GID=$(HOST_GID) \
		--tag "$$LINTER_IMAGE" .; \
	docker run --platform=linux/amd64 \
		-v "$$VOLUME" --rm \
		-e RUN_LOCAL=true \
		-e DEFAULT_WORKSPACE="$$DEFAULT_WORKSPACE" \
		-e DEFAULT_BRANCH="$$DEFAULT_BRANCH" \
		-e USE_FIND_ALGORITHM=false \
		-e FILTER_REGEX_INCLUDE="$(filter-out $@,$(MAKECMDGOALS))" \
		-e 'FILTER_REGEX_EXCLUDE=/(\.cache|\.reports)/' \
		$(1) \
		"$$LINTER_IMAGE"
endef

#############################
# Positional filters for lint commands only
#############################
ifneq ($(filter lint lint-fix,$(firstword $(MAKECMDGOALS))),)
%:
	@:
endif
