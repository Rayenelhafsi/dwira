sed -i 's/\r$//' /var/www/dwiraimmobilier.com/public/.env
sed -i "s|^WEBAUTHN_RP_NAME=.*$|WEBAUTHN_RP_NAME='Dwira Immobilier'|" /var/www/dwiraimmobilier.com/public/.env
nl -ba /var/www/dwiraimmobilier.com/public/.env | sed -n '23,25p'
sudo -u deploy bash /var/www/dwiraimmobilier.com/public/scripts/deploy-production.sh main