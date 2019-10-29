module.exports = {
  normalizeEmail(email) {
    email = email.toLowerCase();
    email = email.replace('@zlien.com', '@levelset.com');
    email = email.replace('@yubb-software.com', '@levelset.com');
    return email;
  },
}

/* vim: set ts=2 sw=2 et: */
