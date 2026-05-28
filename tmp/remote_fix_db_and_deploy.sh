# Force deploy script DB credentials to app user
if grep -q '^DB_USER=' /var/www/dwiraimmobilier.com/public/.env; then
  sed -i "s|^DB_USER=.*$|DB_USER=dwira_user|" /var/www/dwiraimmobilier.com/public/.env
else
  echo "DB_USER=dwira_user" >> /var/www/dwiraimmobilier.com/public/.env
fi
if grep -q '^DB_PASSWORD=' /var/www/dwiraimmobilier.com/public/.env; then
  sed -i "s|^DB_PASSWORD=.*$|DB_PASSWORD='DwiraStrong2026Pass'|" /var/www/dwiraimmobilier.com/public/.env
else
  echo "DB_PASSWORD='DwiraStrong2026Pass'" >> /var/www/dwiraimmobilier.com/public/.env
fi
if grep -q '^DB_NAME=' /var/www/dwiraimmobilier.com/public/.env; then
  sed -i "s|^DB_NAME=.*$|DB_NAME=dwira|" /var/www/dwiraimmobilier.com/public/.env
else
  echo "DB_NAME=dwira" >> /var/www/dwiraimmobilier.com/public/.env
fi
nl -ba /var/www/dwiraimmobilier.com/public/.env | sed -n '5,10p'
sudo -u deploy bash /var/www/dwiraimmobilier.com/public/scripts/deploy-production.sh main
