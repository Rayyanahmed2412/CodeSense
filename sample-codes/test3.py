x = 5
y = 10

def bad_func(arg, arg, lst=[]):
    lst.append(arg)
    return lst

# Using exec and eval
exec("z = x + y")
eval("print(z)")

# Undefined variable, comparing with itself, and self-assigning variable
undefined_var = undefined_var

# Unidiomatic type check
if type(x) == int:
    print("x is an integer")
# Useless else on loop
for i in range(3):
    print(i)
else:
    print("Loop finished")

# Pointless statement
"This does nothing"

# Dangerous comparison and abstract class instantiation
if 42 == x:
    print("x is 42")

class AbstractBase:
    def __init__(self):
        raise NotImplementedError

obj = AbstractBase()

# Return outside function
return 5

# Yield outside function
yield 10

# Continue in finally block
def broken_func():
    try:
        return
    finally:
        continue

bad_func(1, 2)