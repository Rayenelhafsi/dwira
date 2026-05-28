sed -i 's/\r$//' /var/www/dwiraimmobilier.com/public/.env
awk 'BEGIN{FS="="; OFS="="}
{
  if ($0 ~ /^[[:space:]]*#/ || $0 !~ /=/) { print $0; next }
  key=$1
  val=substr($0, length(key)+2)
  gsub(/^[[:space:]]+|[[:space:]]+$/, "", val)
  if (val ~ /^".*"$/ || val ~ /^'\''.*'\''$/) { print key, val; next }
  if (val ~ /[[:space:]$`\\]/) {
    gsub(/'\''/, "'\''\\'\'''\''", val)
    print key, "'\''" val "'\''"
  } else {
    print key, val
  }
}' /var/www/dwiraimmobilier.com/public/.env > /var/www/dwiraimmobilier.com/public/.env.tmp && mv /var/www/dwiraimmobilier.com/public/.env.tmp /var/www/dwiraimmobilier.com/public/.env
nl -ba /var/www/dwiraimmobilier.com/public/.env | sed -n '23,25p;75,78p'
sudo -u deploy bash /var/www/dwiraimmobilier.com/public/scripts/deploy-production.sh main
