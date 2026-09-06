-- Separate investigation-authorisation approval from ordinary case editing.
-- Only a supervisor or administrator may approve/reject collection authority.

INSERT INTO permissions (code, description)
VALUES ('CASE_AUTHORIZE', 'Approve or reject investigation collection authority')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code = 'CASE_AUTHORIZE'
WHERE role.code IN ('ADMIN', 'SUPERVISOR')
ON CONFLICT DO NOTHING;
