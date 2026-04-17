const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
});

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatPercent(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : ''}${percentFormatter.format(numeric)}%`;
}

export function formatSignedCurrency(value) {
  const numeric = Number(value || 0);
  return `${numeric > 0 ? '+' : ''}${formatCurrency(numeric)}`;
}

export function formatQuantity(value) {
  return numberFormatter.format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return dateFormatter.format(date);
}
