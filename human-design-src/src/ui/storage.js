// Local-only persistence. Nothing here is ever sent to a server — birth
// data lives in this browser, on this device, for this site's origin only.
const PEOPLE_KEY = "tt-hd:people:v1";
const CIRCLES_KEY = "tt-hd:circles:v1";

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getPeople() {
  return read(PEOPLE_KEY);
}
export function savePerson(person) {
  const people = getPeople();
  const idx = people.findIndex((p) => p.id === person.id);
  if (idx >= 0) people[idx] = person;
  else people.push(person);
  write(PEOPLE_KEY, people);
  return person;
}
export function deletePerson(id) {
  write(PEOPLE_KEY, getPeople().filter((p) => p.id !== id));
  for (const circle of getCircles()) {
    if (circle.memberIds.includes(id)) {
      circle.memberIds = circle.memberIds.filter((m) => m !== id);
      saveCircle(circle);
    }
  }
}
export function getPerson(id) {
  return getPeople().find((p) => p.id === id) ?? null;
}

export function getCircles() {
  return read(CIRCLES_KEY);
}
export function saveCircle(circle) {
  const circles = getCircles();
  const idx = circles.findIndex((c) => c.id === circle.id);
  if (idx >= 0) circles[idx] = circle;
  else circles.push(circle);
  write(CIRCLES_KEY, circles);
  return circle;
}
export function deleteCircle(id) {
  write(CIRCLES_KEY, getCircles().filter((c) => c.id !== id));
}
export function getCircle(id) {
  return getCircles().find((c) => c.id === id) ?? null;
}
