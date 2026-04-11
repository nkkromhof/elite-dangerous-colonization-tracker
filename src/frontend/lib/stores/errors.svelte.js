const MAX_ERRORS = 50;

let errors = $state([]);

export function addError(error) {
  errors.unshift(error);
  if (errors.length > MAX_ERRORS) errors.pop();
}

export function getErrors() {
  return errors;
}

export function getErrorCount() {
  return errors.length;
}

export function clearErrors() {
  errors = [];
}
