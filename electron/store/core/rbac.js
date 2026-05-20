function ensureDataManagerRole(requesterRole, fail, role) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:forbidden", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

function ensureDataDeleteRole(requesterRole, fail, role) {
  if (requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:delete:forbidden", "Acces refuse: suppression reservee au responsable.", "AUTH_FORBIDDEN", {
      requesterRole
    });
  }
}

function ensureDataReaderRole(requesterRole, fail, role) {
  if (requesterRole !== role.OPERATEUR && requesterRole !== role.RESPONSABLE && requesterRole !== role.DEV) {
    fail("data:forbidden", "Acces refuse: droits insuffisants.", "AUTH_FORBIDDEN", { requesterRole });
  }
}

module.exports = { ensureDataManagerRole, ensureDataDeleteRole, ensureDataReaderRole };
