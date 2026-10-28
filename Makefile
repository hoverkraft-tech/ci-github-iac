SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help test lint docs e2e e2e-up e2e-test e2e-collect e2e-down
help:
	@printf '%s\n' 'make test | lint | docs | e2e' 'make e2e-up | e2e-test | e2e-collect | e2e-down'

test:
	python3 -m unittest discover -s tests -v

lint:
	docker build --tag ci-github-iac-linter .
	docker run --rm -e RUN_LOCAL=true -e DEFAULT_WORKSPACE=/workspace -v "$(CURDIR):/workspace" ci-github-iac-linter

docs:
	npm exec --yes --package=@ci-dokumentor/cli@0.5.0 -- ci-dokumentor generate --source .github/workflows/vm-e2e.yml --repository git

e2e:
	@status=0; trap '$(MAKE) e2e-down || status=$$?; exit $$status' EXIT; \
	$(MAKE) e2e-up && $(MAKE) e2e-test || status=$$?; \
	$(MAKE) e2e-collect || status=$$?

e2e-up e2e-test e2e-collect e2e-down:
	python3 tests/fixture/vm.py $(@:e2e-%=%)
