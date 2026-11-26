type NavigationGuard = () => Promise<boolean>;
let guard: NavigationGuard | undefined;

export function guardNavigation(next: NavigationGuard) {
  guard = next;
  return () => {
    if (guard === next) guard = undefined;
  };
}

export function canNavigate() {
  return guard ? guard() : Promise.resolve(true);
}
