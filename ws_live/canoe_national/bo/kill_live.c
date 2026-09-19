#include <stdlib.h>
#include <stdio.h>
#include <sys/types.h>
#include <unistd.h>

int main(int argc, char *argv[])
{
	int i=0;
	char cmd[40];
	
	setuid(0);

	for (i=1; i< argc; i++) 
	{
		sprintf(cmd, "fuser -k %s/tcp", argv[i]);
		system(cmd);
	}

	return 0;
}