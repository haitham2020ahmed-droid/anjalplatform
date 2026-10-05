# Backup runner: mysqldump + GPG (public key only: this container can encrypt, never decrypt).
FROM mysql:8.4
RUN microdnf install -y gnupg2 gzip tar && microdnf clean all
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/restore.sh
ENTRYPOINT ["/usr/local/bin/backup.sh"]
