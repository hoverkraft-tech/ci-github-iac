run "apply_and_read" {
  command = apply
  assert {
    condition     = terraform_data.fixture.output == "synthetic-native-test"
    error_message = "The native fixture must retain its input."
  }
}
