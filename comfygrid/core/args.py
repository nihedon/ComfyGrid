def parse_python_args(args):
    kwargs = {}
    skip_next = False
    for i in range(len(args)):
        if skip_next:
            skip_next = False
            continue
        if args[i].startswith("--"):
            key = args[i][2:]
            if i + 1 < len(args) and not args[i + 1].startswith("--"):
                kwargs[key] = args[i + 1]
                skip_next = True
            else:
                kwargs[key] = True
    return kwargs
